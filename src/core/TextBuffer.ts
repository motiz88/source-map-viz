const FIRST = 0;

export default class TextBuffer {
    private contents: string;
    // private contentsAsUint8: Uint8Array;
    private lineStarts: Array<number> | null = null;

    private constructor(contents: string) {
        this.contents = contents;
        // this.contentsAsUint8 = new Uint8Array(this.contents);
        this._getOrCreateLineStarts();
    }

    private _maxLineLength: number = 0;

    _getOrCreateLineStarts() {
        if (this.lineStarts) {
            return this.lineStarts;
        }
        let offset = 0;
        this.lineStarts = [];
        const {lineStarts, contents} = this;
        const {length} = contents;
        while (offset < length) {
            const prevOffset = offset;
            lineStarts.push(offset);
            offset = contents.indexOf('\n', offset);
            let lineLength;
            if (offset === -1) {
                lineLength = length - prevOffset;
            } else {
                lineLength = offset - prevOffset;
            }
            if (lineLength > this._maxLineLength) {
                this._maxLineLength = lineLength;
            }
            if (offset === -1) {
                break;
            }
            offset += 1;
        }
        return this.lineStarts;
    }

    static from(contents: string): TextBuffer {
        return new TextBuffer(contents);
    }

    getLineStarts(): ReadonlyArray<number> {
        return this.lineStarts!;
    }

    get lineCount(): number {
        return this.lineStarts!.length;
    }

    getLine(index: number): string {
        // FIXME: CRLF
        const {lineStarts, contents} = this;
        return contents.slice(lineStarts![index], lineStarts![index+1]);
    }

    get maxLineLength(): number {
        return this._maxLineLength;
    }
}