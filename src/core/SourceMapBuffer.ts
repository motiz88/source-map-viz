import { SourceMapConsumer, MappingItem, Mapping } from "source-map";

type LineChunk = {
  startColumn: number;
  mappings: Array<MappingItem>;
};

export const CHUNK_SIZE = 128;

export default class SourceMapBuffer {
  private consumer: Promise<SourceMapConsumer>;
  private mappingsByLine: Array<Array<MappingItem>> | null;
  private chunkedMappingsByLine: Array<Array<LineChunk>> | null;
  private loadingPromise: Promise<any>;
  private _maxChunkCount: number;

  private constructor(contents: string) {
    this.consumer = new SourceMapConsumer(contents);
    this.mappingsByLine = null;
    this.chunkedMappingsByLine = null;
    this._maxChunkCount = 0;
    this.loadingPromise = Promise.all([
      //   this._getOrCreateMappingsByLine(),
      this._getOrCreateChunkedMappingsByLine()
    ]);
  }

  loaded(): Promise<void> {
    return this.loadingPromise;
  }

  async _getOrCreateMappingsByLine() {
    if (this.mappingsByLine) {
      return this.mappingsByLine;
    }
    let offset = 0;
    this.mappingsByLine = [];
    const { mappingsByLine, consumer: consumerPromise } = this;
    const consumer = await consumerPromise;
    consumer.eachMapping(
      mapping => {
        const lineIndex = mapping.generatedLine - 1;
        const lineMappings = mappingsByLine[lineIndex] || [];
        if (mapping.generatedColumn > 0 && lineMappings.length === 0) {
          lineMappings.push({
            generatedColumn: 0,
            generatedLine: mapping.generatedLine,
            // @ts-ignore
            name: null,
            // @ts-ignore
            source: null,
            // @ts-ignore
            originalColumn: null,
            // @ts-ignore
            originalLine: null
          });
        }
        lineMappings.push(mapping);
        mappingsByLine[lineIndex] = lineMappings;
      },
      null,
      SourceMapConsumer.GENERATED_ORDER
    );
    return this.mappingsByLine;
  }

  async _getOrCreateChunkedMappingsByLine() {
    if (this.chunkedMappingsByLine) {
      return this.chunkedMappingsByLine;
    }
    let offset = 0;
    this.chunkedMappingsByLine = [];
    const { chunkedMappingsByLine, consumer: consumerPromise } = this;
    const consumer = await consumerPromise;
    const pushMapping = (mapping: MappingItem) => {
      const lineIndex = mapping.generatedLine - 1;
      const lineChunks = chunkedMappingsByLine[lineIndex] || [];
      chunkedMappingsByLine[lineIndex] = lineChunks;

      if (mapping.generatedColumn > 0 && lineChunks.length === 0) {
        pushMapping({
          generatedColumn: 0,
          generatedLine: mapping.generatedLine,
          // @ts-ignore
          name: null,
          // @ts-ignore
          source: null,
          // @ts-ignore
          originalColumn: null,
          // @ts-ignore
          originalLine: null
        });
      }
      const chunkIndex = Math.floor(mapping.generatedColumn / CHUNK_SIZE);
      const chunk = lineChunks[chunkIndex] || {
        mappings: [],
        startColumn: chunkIndex * CHUNK_SIZE,
      };

      chunk.mappings.push(mapping);
      lineChunks[chunkIndex] = chunk;

      if (chunkIndex + 1 > this._maxChunkCount) {
        this._maxChunkCount = chunkIndex + 1;
      }
    };

    consumer.eachMapping(pushMapping, null, SourceMapConsumer.GENERATED_ORDER);
    return this.chunkedMappingsByLine;
  }

  static from(contents: string): SourceMapBuffer {
    // @ts-ignore
    SourceMapConsumer.initialize({ "lib/mappings.wasm": "./mappings.wasm" });
    return new SourceMapBuffer(contents);
  }

  mappingsForLine(index: number): ReadonlyArray<MappingItem> {
    return this.mappingsByLine![index];
  }

  chunkedMappingsForLine(index: number): ReadonlyArray<LineChunk> {
    return this.chunkedMappingsByLine![index];
  }

  get maxChunkCount(): number {
    return this._maxChunkCount;
  }

  async sourceContentFor(source: string) {
    const consumer = await this.consumer;
    return consumer.sourceContentFor(source, true);
  }
}
