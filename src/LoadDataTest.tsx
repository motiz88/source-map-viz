import React, {
  useState,
  useEffect,
  forwardRef,
  memo,
  Suspense,
  useMemo,
  useRef
} from "react";
import TextBuffer from "./core/TextBuffer";
import { FixedSizeGrid as Grid, areEqual } from "react-window";
import AutoSizer from "react-virtualized-auto-sizer";
import SourceMapBuffer, { CHUNK_SIZE } from "./core/SourceMapBuffer";
import { MappingItem } from "source-map";
import DataLoader from "dataloader";

type SourceTextBuffers = DataLoader<string, TextBuffer | null> | null;

function urlFromSource(source: string) {
  return source.replace(/^\/js\//, "/");
}

function wrapPromise<T>(promise: Promise<T>) {
  let status = "pending";
  let result: T;
  let suspender = promise.then(
    r => {
      status = "success";
      result = r;
    },
    e => {
      status = "error";
      result = e;
    }
  );
  return {
    read(): T {
      if (status === "pending") {
        throw suspender;
      } else if (status === "error") {
        throw result;
      } /*if (status === "success") */ else {
        return result;
      }
    }
  };
}

const CHAR_HEIGHT_PX = 16;
const CHAR_WIDTH_PX = 9.6;

const Row = memo(
  ({
    data: {
      textBuffer,
      mapBuffer,
      setActiveMapping,
      focusLineIndex,
      focusColumnIndex,
      focusColumns
    },
    rowIndex: lineIndex,
    columnIndex: chunkIndex,
    style
  }: // isScrolling
  {
    data: {
      textBuffer: TextBuffer;
      mapBuffer: SourceMapBuffer | null;
      setActiveMapping: ((activeMapping: MappingItem | null) => void) | null;
      focusLineIndex: number | null;
      focusColumnIndex: number | null;
      focusColumns: number | null;
    };
    rowIndex: number;
    columnIndex: number;
    style: React.CSSProperties;
    // isScrolling?: boolean;
  }) => {
    const chunkClasses = `LineChunk ${
      focusLineIndex === lineIndex ? "Line-Focused" : ""
    }`;
    const lineContents = textBuffer.getLine(lineIndex);
    const lineLength = lineContents.length;
    const lineChunks =
      (mapBuffer && mapBuffer.chunkedMappingsForLine(lineIndex)) || [];
    const chunk = lineChunks[chunkIndex];
    if (!chunk) {
      if (
        !mapBuffer &&
        focusColumnIndex != null &&
        focusLineIndex === lineIndex
      ) {
        // FIXME: UNICODE
        const beforeFocused = lineContents.slice(
          chunkIndex * CHUNK_SIZE,
          focusColumnIndex
        );
        const focused = lineContents.slice(
          focusColumnIndex,
          focusColumnIndex + (focusColumns == null ? 1 : focusColumns)
        );
        const afterFocused = lineContents.slice(
          focusColumnIndex + focused.length,
          (chunkIndex + 1) * CHUNK_SIZE
        );
        return (
          <div style={style} className={chunkClasses}>
            <span className={"CodeSpan-Source"}>{beforeFocused}</span>
            <span className={"CodeSpan-Source CodeSpan-Focused"}>
              {focused}
            </span>
            <span className={"CodeSpan-Source"}>{afterFocused}</span>
          </div>
        );
      }
      return (
        <div style={style} className={chunkClasses}>
          <span
            className={mapBuffer ? "CodeSpan-Unmapped" : "CodeSpan-Source"}
            onMouseEnter={
              setActiveMapping ? () => setActiveMapping(null) : undefined
            }
          >
            {lineContents.slice(
              chunkIndex * CHUNK_SIZE,
              (chunkIndex + 1) * CHUNK_SIZE
            )}
          </span>
        </div>
      );
    }
    const nextChunk = lineChunks[chunkIndex + 1];
    const { startColumn: chunkStart } = chunk;
    const chunkEnd = nextChunk
      ? nextChunk.startColumn
      : chunkStart + CHUNK_SIZE;
    const { mappings } = chunk;
    const mappingsLength = mappings.length;
    // const fillerBefore = lineContents.slice(
    //   chunkStart,
    //   mappings[0] ? mappings[0].generatedColumn : 0
    // );
    const fillerBefore = " ".repeat(
      mappings[0] ? mappings[0].generatedColumn - chunkStart : 0
    );
    const nextMappingOrChunkEnd =
      (nextChunk &&
        nextChunk.mappings[0] &&
        nextChunk.mappings[0].generatedColumn) ||
      chunkEnd;
    return (
      <div style={style} className={chunkClasses}>
        {/* FIXME: text selection?!? */}
        <span className="CodeSpan-Filler">{fillerBefore}</span>
        {mappings.map((mapping, index) => {
          const mappingContents = lineContents.slice(
            mapping.generatedColumn,
            index + 1 < mappingsLength
              ? mappings[index + 1].generatedColumn
              : nextMappingOrChunkEnd
          );
          const isMapped = mapping.source != null;
          return (
            <span
              key={index}
              className={isMapped ? "CodeSpan-Mapped" : "CodeSpan-Unmapped"}
              onMouseEnter={
                setActiveMapping ? () => setActiveMapping(mapping) : undefined
              }
            >
              {mappingContents}
            </span>
          );
        })}
      </div>
    );
  },
  areEqual
);

const TextContainer = forwardRef((props, ref: React.Ref<HTMLDivElement>) => (
  <div ref={ref} {...props} className="TextContainer" />
));

const MappingSource = ({
  source,
  textBufferResource,
  focusColumnIndex,
  focusLineIndex,
  focusColumns
}: {
  source: string;
  textBufferResource: { read(): TextBuffer | null };
  focusColumnIndex: number;
  focusLineIndex: number;
  focusColumns: number;
}) => {
  const gridRef = useRef<Grid>(null);
  useEffect(() => {
    if (gridRef.current != null) {
      gridRef.current.scrollToItem({
        align: "center",
        columnIndex: Math.floor(focusColumnIndex / CHUNK_SIZE),
        rowIndex: focusLineIndex
      });
    }
  }, [focusColumnIndex, focusLineIndex]);
  const textBuffer = textBufferResource.read();
  if (!textBuffer) {
    return <div>No source</div>;
  }
  return (
    <div className="MappingSourceContainer">
      <AutoSizer>
        {({ height, width }) => (
          <Grid
            ref={gridRef}
            useIsScrolling
            outerElementType={TextContainer}
            height={height}
            rowCount={textBuffer.lineCount}
            rowHeight={CHAR_HEIGHT_PX}
            itemData={{
              textBuffer,
              focusLineIndex,
              focusColumnIndex,
              focusColumns
            }}
            width={width}
            columnCount={Math.ceil(textBuffer.maxLineLength / CHUNK_SIZE)}
            columnWidth={CHUNK_SIZE * CHAR_WIDTH_PX}
            overscanRowCount={Math.ceil((0.2 * height) / CHAR_HEIGHT_PX)}
          >
            {Row}
          </Grid>
        )}
      </AutoSizer>
    </div>
  );
};

const MappingDetailView = ({
  mapping,
  sourceTextBuffers
}: {
  mapping: MappingItem;
  sourceTextBuffers: SourceTextBuffers;
}) => {
  const textBufferResource = useMemo(
    () => mapping.source != null ? wrapPromise(sourceTextBuffers!.load(mapping.source)) : null,
    [mapping.source]
  );
  return (
    <div className="MappingDetailView">
      <ul>
        {mapping.source != null ? (
          <>
            <li>Source: {mapping.source}</li>
            <li>Orig. line (1-based): {mapping.originalLine}</li>
            <li>Orig. column (0-based): {mapping.originalColumn}</li>
            {mapping.name != null ? <li>Identifier: {mapping.name}</li> : null}
          </>
        ) : (
          <>
            <li>Not mapped</li>
          </>
        )}
      </ul>
      {mapping.source != null ? (
        <Suspense fallback={"Loading..."}>
          <MappingSource
            textBufferResource={textBufferResource!}
            source={mapping.source}
            focusColumnIndex={mapping.originalColumn}
            focusLineIndex={mapping.originalLine - 1}
            focusColumns={mapping.name == null ? 1 : mapping.name.length}
          />
        </Suspense>
      ) : null}
    </div>
  );
};

export default function LoadDataTest() {
  const [textBuffer, setTextBuffer] = useState<TextBuffer | null>(null);
  const [mapBuffer, setMapBuffer] = useState<SourceMapBuffer | null>(null);
  const [activeMapping, setActiveMapping] = useState<MappingItem | null>();
  useEffect(
    () => (
      (async () => {
        var t0 = performance.now();
        const [code, map] = await Promise.all(
          ["./data/Fb4aBundle.js", "./data/Fb4aBundle.js.map"].map(url =>
            fetch(url).then(res => res.text())
          )
        );
        const bufCode = TextBuffer.from(code);
        const bufMap = SourceMapBuffer.from(map);
        var t1 = performance.now();
        await bufMap.loaded();
        console.log(
          "Loading and indexing took " + (t1 - t0) + " milliseconds."
        );
        setTextBuffer(bufCode);
        setMapBuffer(bufMap);
      })(),
      undefined
    ),
    []
  );

  const sourceTextBuffers = useMemo(() => {
    if (!mapBuffer) {
      return null;
    }
    return new DataLoader(async (sources: ReadonlyArray<string>) => {
      return Promise.all(
        sources.map(async source => {
          let contents = await mapBuffer.sourceContentFor(source);
          if (contents == null) {
            contents = await (await fetch(urlFromSource(source))).text();
          }
          if (contents == null) {
            return null;
          }
          return TextBuffer.from(contents);
        })
      );
    });
  }, [mapBuffer]);

  return (
    <>
      <div className="SplitArea">
        <div className="GeneratedArea">
          {textBuffer && mapBuffer ? (
            <AutoSizer>
              {({ height, width }) => (
                <Grid
                  useIsScrolling
                  outerElementType={TextContainer}
                  height={height}
                  rowCount={textBuffer.lineCount}
                  rowHeight={CHAR_HEIGHT_PX}
                  itemData={{ textBuffer, mapBuffer, setActiveMapping }}
                  width={width}
                  columnCount={mapBuffer.maxChunkCount}
                  columnWidth={CHUNK_SIZE * CHAR_WIDTH_PX}
                  overscanRowCount={Math.ceil((0.2 * height) / CHAR_HEIGHT_PX)}
                >
                  {Row}
                </Grid>
              )}
            </AutoSizer>
          ) : null}
        </div>
        <div className="InfoArea">
          {activeMapping ? (
            <MappingDetailView
              mapping={activeMapping}
              sourceTextBuffers={sourceTextBuffers}
            />
          ) : null}
        </div>
      </div>
    </>
  );
}
