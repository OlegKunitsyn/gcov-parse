/**
 * Ported from
 * https://github.com/mitchhentges/lcov-rs/wiki/File-format
 * https://github.com/eclipse/linuxtools/tree/master/gcov
 * Eclipse Public License 2.0
 */
import * as fs from "fs";

export interface CoverageLine {
    line: number;
    executed: boolean;
}

export interface Coverage {
    file: string;
    instrumented: number;
    executed: number;
    lines: CoverageLine[]
}

/**
 * Parse GCOV files and return Coverage array
 * @throws Error
 * @param gcovFiles full path to the files, without trailing .gcda/.gcno extension
 */
export function parse(gcovFiles: string[]): Coverage[] {
    let gcdaRecordsParser: GcdaRecordsParser;
    let stream: DataInput;
    const sourceFiles: SourceFile[] = [];
    const gcnoFunctions: GcnoFunction[] = [];
    const sourceMap: Map<string, SourceFile> = new Map<string, SourceFile>();

    for (const gcovFile of gcovFiles) {
        // parse GCNO
        let file = gcovFile + '.gcno';
        if (!fs.existsSync(file)) {
            throw Error("File not found: " + file);
        }
        stream = new DataInput(fs.readFileSync(file));
        const gcnoRecordsParser = new GcnoRecordsParser(sourceMap, sourceFiles);
        gcnoRecordsParser.parse(stream);

        // add new functions
        for (const f of gcnoRecordsParser.getFunctions()) {
            gcnoFunctions.push(f);
        }

        // parse GCDA
        file = gcovFile + '.gcda';
        if (!fs.existsSync(file)) {
            throw Error("File not found: " + file);
        }
        stream = new DataInput(fs.readFileSync(file));
        if (gcnoRecordsParser.getFunctions().length === 0) {
            throw new Error("Parsing error");
        }
        gcdaRecordsParser = new GcdaRecordsParser(gcnoRecordsParser.getFunctions());
        gcdaRecordsParser.parse(stream);
    }

    // solve graph for each function
    for (const f of gcnoFunctions) {
        f.solveGraphFunction();
    }

    // allocate lines
    for (const sourceFile of sourceFiles) {
        for (let j = 0; j < sourceFile.linesCount; j++) {
            sourceFile.lines.push(new Line());
        }
        sourceFile.functions.forEach((fn) => {
            for (const block of fn.functionBlocks) {
                if (block.blockLines == null) {
                    continue;
                }
                for (let i = 2; i < block.blockLines.length; ++i) {
                    const lineno = block.blockLines[i];
                    if (lineno === 0)
                        break;
                    const line: Line = sourceFile.lines[lineno];
                    line.blocks.add(block);
                }
            }
        })
    }

    // add line counts
    for (const f of gcnoFunctions) {
        f.addLineCounts(sourceFiles);
    }

    // coverage
    const coverages: Coverage[] = [];
    for (const sourceFile of sourceFiles) {
        const coverage: Coverage = {
            file: sourceFile.name,
            instrumented: 0,
            executed: 0,
            lines: []
        }
        for (let i = 0; i < sourceFile.lines.length; i++) {
            if (sourceFile.lines[i].exists) {
                coverage.instrumented++;
                if (sourceFile.lines[i].count > 0) {
                    coverage.executed++;
                }
                coverage.lines.push({line: i, executed: sourceFile.lines[i].count > 0} as CoverageLine);
            }
        }
        coverages.push(coverage);
    }
    return coverages;
}

class Arc {
    readonly VCOV_ARC_ON_TREE: number = (1 << 0);
    readonly VCOV_ARC_FAKE: number = (1 << 1);
    readonly VCOV_ARC_FALLTHROUGH: number = (1 << 2);
    srcBlock: Block;
    dstBlock: Block;
    isFake: boolean;
    isOnTree: boolean;
    count: number = 0;
    isValid: boolean = false;

    constructor(srcBlockIndex: number, dstBlockIndice: number, flag: number, otherArcParams: Block[]) {
        this.dstBlock = otherArcParams[dstBlockIndice];
        this.srcBlock = otherArcParams[srcBlockIndex];
        if ((flag & this.VCOV_ARC_ON_TREE) !== 0) {
            this.isOnTree = true;
            this.isFake = false;
        } else if ((flag & this.VCOV_ARC_FAKE) !== 0) {
            this.isOnTree = false;
            this.isFake = true;
        } else if ((flag & this.VCOV_ARC_FALLTHROUGH) !== 0) {
            this.isOnTree = false;
            this.isFake = false;
        } else {
            this.isOnTree = false;
            this.isFake = false;
        }
    }
}

class Block {
    entryArcs: Arc[] = [];
    exitArcs: Arc[] = [];
    successCount: number = 0;
    predictionsCount: number = 0;
    count: number = 0;
    isCallSite: boolean = false;
    isValidChain: boolean = false;
    isInvalidChain: boolean = false;
    countValid: boolean = false;
    blockLines: number[] = [];
    lineNumber: number = 0;
}

class Line {
    exists: boolean = false;
    count: number = 0;
    blocks: Set<Block> = new Set<Block>();
}

class SourceFile {
    name: string;
    index: number;
    lines: Line[] = [];
    functions: Set<GcnoFunction> = new Set<GcnoFunction>();
    linesCount: number = 1;

    constructor(name: string, index: number) {
        this.name = name;
        this.index = index;
    }
}

class DataInput {
    private isBigEndian = true;
    private offset = 0;
    private buffer: Buffer;

    constructor(buffer: Buffer) {
        this.buffer = buffer;
    }

    public readString(): string {
        const length = this.readInt() << 2;
        this.offset += length;
        return this.buffer.subarray(this.offset - length, this.offset).toString('utf8').replace(/\0/g, '');
    }

    public readInt(): number {
        this.offset += 4;
        return this.isBigEndian ?
            this.buffer.subarray(this.offset - 4, this.offset).readUInt32BE() :
            this.buffer.subarray(this.offset - 4, this.offset).readUInt32LE();
    }

    public readLong(): number {
        this.offset += 8;
        return Number(
            this.isBigEndian ?
                this.buffer.subarray(this.offset - 8, this.offset).readBigUInt64BE() :
                this.buffer.subarray(this.offset - 8, this.offset).readBigUInt64LE()
        );
    }

    public setBigEndian(): void {
        this.isBigEndian = true;
    }

    public setLittleEndian(): void {
        this.isBigEndian = false;
    }
}

class GcnoFunction {
    ident: number;
    checksum: number;
    firstLineNumber: number;
    srcFile: string;
    functionBlocks: Block[] = [];
    numBlocks: number = 0;

    constructor(ident: number, checksum: number, srcFile: string, firstLineNumber: number) {
        this.ident = ident;
        this.checksum = checksum;
        this.srcFile = srcFile;
        this.firstLineNumber = firstLineNumber;
    }

    public addLineCounts(sourceFiles: SourceFile[]): void {
        const linesToCalculate = [];
        for (const block of this.functionBlocks) {
            let sourceFile: SourceFile | null = null;
            for (let j = 0, k = 0; j !== block.lineNumber; j++, k++) {
                if (block.blockLines[k] === 0) {
                    const blockLine = block.blockLines[++k];
                    for (const file of sourceFiles) {
                        if (file.index === blockLine) {
                            sourceFile = file;
                            break;
                        }
                    }
                    j++;
                } else if (sourceFile != null && block.blockLines[k] < sourceFile.lines.length) {
                    const line = sourceFile.lines[block.blockLines[k]];
                    line.exists = true;
                    if (line.blocks.size > 1) {
                        linesToCalculate.push(line);
                        line.count = 1;
                    } else {
                        line.count += block.count;
                    }
                }
            }
        }
        for (const line of linesToCalculate) {
            let count = 0;
            line.blocks.forEach((block) => {
                for (const arc of block.entryArcs) {
                    if (!line.blocks.has(arc.srcBlock)) {
                        count += arc.count;
                    }
                }
                line.count = count;
            });
        }
    }

    public solveGraphFunction(): void {
        const validBlocks: Block[] = [];
        const invalidBlocks: Block[] = [];

        if (this.functionBlocks.length >= 2) {
            if (this.functionBlocks[0].predictionsCount === 0) {
                this.functionBlocks[0].predictionsCount = 50000;
            }
            if (this.functionBlocks[this.functionBlocks.length - 1].successCount === 0) {
                this.functionBlocks[this.functionBlocks.length - 1].successCount = 50000;
            }
        }

        for (const b of this.functionBlocks) {
            b.isInvalidChain = true;
            invalidBlocks.push(b);
        }

        while (validBlocks.length > 0 || invalidBlocks.length > 0) {
            if (invalidBlocks.length > 0) {
                for (let i = invalidBlocks.length - 1; i >= 0; i--) {
                    const invalidBlock: Block = invalidBlocks[i];
                    let total = 0;
                    invalidBlocks.pop();
                    invalidBlock.isInvalidChain = false;
                    if (invalidBlock.predictionsCount !== 0 && invalidBlock.successCount !== 0)
                        continue;

                    if (invalidBlock.successCount === 0) {
                        const exitArcs: Arc[] = invalidBlock.exitArcs;
                        for (const arc of exitArcs) {
                            total += arc.count;
                        }
                    }
                    if (invalidBlock.predictionsCount === 0 && total === 0) {
                        const entryArcs: Arc[] = invalidBlock.entryArcs;
                        for (const arc of entryArcs) {
                            total += arc.count;
                        }
                    }

                    invalidBlock.count = total;
                    invalidBlock.countValid = true;
                    invalidBlock.isValidChain = true;
                    validBlocks.push(invalidBlock);
                }
            }
            while (validBlocks.length > 0) {
                const last = validBlocks.length - 1;
                const vb: Block = validBlocks[last];
                let invarc: Arc | null = null;
                let total = 0;
                validBlocks.pop();
                vb.isValidChain = false;
                if (vb.successCount === 1) {
                    let dstBlock: Block;
                    total = vb.count;
                    for (const extAr of vb.exitArcs) {
                        total -= extAr.count;
                        if (!extAr.isValid) {
                            invarc = extAr;
                        }
                    }
                    dstBlock = invarc!.dstBlock;
                    invarc!.isValid = true;
                    invarc!.count = total;
                    vb.successCount--;
                    dstBlock.predictionsCount--;

                    if (dstBlock.countValid) {
                        if (dstBlock.predictionsCount === 1 && !dstBlock.isValidChain) {
                            dstBlock.isValidChain = true;
                            validBlocks.push(dstBlock);
                        }
                    } else {
                        if (dstBlock.predictionsCount === 0 && !dstBlock.isInvalidChain) {
                            dstBlock.isInvalidChain = true;
                            invalidBlocks.push(dstBlock);
                        }
                    }
                }

                if (vb.predictionsCount === 1) {
                    let blcksrc: Block;
                    total = vb.count;
                    invarc = null;

                    for (const entrAr of vb.entryArcs) {
                        total -= entrAr.count;
                        if (!entrAr.isValid) {
                            invarc = entrAr;
                        }
                    }

                    blcksrc = invarc!.srcBlock;
                    invarc!.isValid = true;
                    invarc!.count = total;
                    vb.predictionsCount--;
                    blcksrc.successCount--;

                    if (blcksrc.countValid) {
                        if (blcksrc.successCount === 1 && !blcksrc.isInvalidChain) {
                            blcksrc.isValidChain = true;
                            validBlocks.push(blcksrc);
                        }
                    } else if (blcksrc.successCount === 0 && !blcksrc.isInvalidChain) {
                        blcksrc.isInvalidChain = true;
                        invalidBlocks.push(blcksrc);
                    }
                }
            }
        }
    }
}

interface IRecordParser {
    parse(stream: DataInput): void;
}

class GcdaRecordsParser implements IRecordParser {

    readonly GCOV_DATA_MAGIC: number = 0x67636461;
    readonly GCOV_TAG_FUNCTION: number = 0x01000000;
    readonly GCOV_COUNTER_ARCS: number = 0x01a10000;
    readonly GCOV_TAG_OBJECT_SYMMARY: number = 0xa1000000;
    readonly GCOV_TAG_PROGRAM_SUMMARY: number = 0xa3000000;
    readonly GCC_VER_900: number = 1094266922;
    private gcnoFunctions: GcnoFunction[];

    constructor(gcnoFunctions: GcnoFunction[]) {
        this.gcnoFunctions = gcnoFunctions;
    }

    public parse(stream: DataInput): void {
        let magic: number;
        let gcnoFunction: GcnoFunction | null = null;
        magic = stream.readInt();

        if (magic === this.GCOV_DATA_MAGIC) {
            stream.setBigEndian();
        } else {
            magic = (magic >> 16) | (magic << 16);
            magic = ((magic & 0xff00ff) << 8) | ((magic >> 8) & 0xff00ff);
            if (magic === this.GCOV_DATA_MAGIC) {
                stream.setLittleEndian();
            } else {
                throw new Error("Unsupported format");
            }
        }

        const version = stream.readInt();
        stream.readInt();
        while (true) {
            try {
                const tag = stream.readInt();
                if (tag === 0) {
                    continue;
                }
                const length = stream.readInt();
                switch (tag) {
                    case this.GCOV_TAG_FUNCTION: {
                        const ident = stream.readInt();
                        if (this.gcnoFunctions.length > 0) {
                            for (const f of this.gcnoFunctions) {
                                if (f.ident === ident) {
                                    gcnoFunction = f;
                                    const checksum = stream.readInt();
                                    if (f.checksum !== checksum) {
                                        throw new Error("Parsing error");
                                    }
                                    if (version >= 875575082) {
                                        stream.readInt();
                                    }
                                    break;
                                }
                            }
                        }
                        break;
                    }
                    case this.GCOV_COUNTER_ARCS: {
                        if (gcnoFunction == null) {
                            throw new Error("Parsing error");
                        }
                        const blocks: Block[] = gcnoFunction.functionBlocks;
                        if (blocks.length === 0) {
                            throw new Error("Parsing error");
                        }
                        for (const block of blocks) {
                            const exitArcs: Arc[] = block.exitArcs;
                            for (const exitArc of exitArcs) {
                                if (!exitArc.isOnTree) {
                                    exitArc.count = stream.readLong();
                                    exitArc.isValid = true;
                                    block.successCount--;
                                    exitArc.dstBlock.predictionsCount--;
                                }
                            }
                        }
                        gcnoFunction = null;
                        break;
                    }
                    case this.GCOV_TAG_OBJECT_SYMMARY: {
                        if (version >= this.GCC_VER_900) {
                            stream.readInt();
                            stream.readInt();
                        } else {
                            stream.readInt();
                            stream.readInt();
                            stream.readInt();
                            stream.readInt();
                            stream.readInt();
                            stream.readInt();
                        }
                        break;
                    }
                    case this.GCOV_TAG_PROGRAM_SUMMARY: {
                        stream.readInt();
                        stream.readInt();
                        stream.readInt();
                        for (let i = 0; i < length - 3; i++) {
                            stream.readInt();
                        }
                        break;
                    }
                    default: {
                        break;
                    }
                }
            } catch (RangeError) {
                break;
            }
        }
    }
}

class GcnoRecordsParser implements IRecordParser {

    readonly GCOV_NOTE_MAGIC: number = 0x67636e6f;
    readonly GCOV_TAG_FUNCTION: number = 0x01000000;
    readonly GCOV_TAG_BLOCKS: number = 0x01410000;
    readonly GCOV_TAG_ARCS: number = 0x01430000;
    readonly GCOV_TAG_LINES: number = 0x01450000;
    readonly GCC_VER_810: number = 1094201642;
    readonly GCC_VER_910: number = 1094267178;
    readonly GCC_VER_407: number = 875575082; // GCC 4.0.7
    private gcnoFunction: GcnoFunction | null = null;
    private gcnoFunctions: GcnoFunction[] = [];
    private sources: SourceFile[];
    private sourceMap: Map<string, SourceFile>;

    constructor(sourceMap: Map<string, SourceFile>, sources: SourceFile[]) {
        this.sourceMap = sourceMap;
        this.sources = sources;
    }

    public parse(stream: DataInput): void {
        let magic: number;
        let blocks: Block[] | null = null;
        let source: SourceFile | null = null;
        let parseFirstFunction: boolean = false;

        magic = stream.readInt();
        if (magic === this.GCOV_NOTE_MAGIC) {
            stream.setBigEndian();
        } else {
            magic = (magic >> 16) | (magic << 16);
            magic = ((magic & 0xff00ff) << 8) | ((magic >> 8) & 0xff00ff);
            if (magic === this.GCOV_NOTE_MAGIC) {
                stream.setLittleEndian();
            } else {
                throw new Error("Unsupported format");
            }
        }

        const version = stream.readInt();
        stream.readInt();
        while (true) {
            try {
                let tag;
                while (true) {
                    tag = stream.readInt();
                    if (tag === this.GCOV_TAG_FUNCTION || tag === this.GCOV_TAG_BLOCKS || tag === this.GCOV_TAG_ARCS || tag === this.GCOV_TAG_LINES)
                        break;
                }
                let length = stream.readInt();
                switch (tag) {
                    case this.GCOV_TAG_FUNCTION:
                        if (parseFirstFunction) {
                            this.gcnoFunctions.push(this.gcnoFunction!);
                        }
                        const ident = stream.readInt();
                        const checksum = stream.readInt();
                        if (version >= this.GCC_VER_407) {
                            stream.readInt();
                        }
                        const name = stream.readString();
                        if (version >= this.GCC_VER_810) {
                            stream.readInt();
                        }
                        const srcFile = stream.readString();
                        const firstLineNumber = stream.readInt();
                        if (version >= this.GCC_VER_810) {
                            stream.readInt();
                            stream.readInt();
                        }
                        if (version >= this.GCC_VER_910) {
                            stream.readInt();
                        }
                        this.gcnoFunction = new GcnoFunction(ident, checksum, srcFile, firstLineNumber);
                        const file = this.findOrAdd(this.gcnoFunction.srcFile);
                        if (this.gcnoFunction.firstLineNumber >= file.linesCount) {
                            file.linesCount = this.gcnoFunction.firstLineNumber + 1;
                        }
                        file.functions.add(this.gcnoFunction);
                        parseFirstFunction = true;
                        break;
                    case this.GCOV_TAG_BLOCKS:
                        if (version >= this.GCC_VER_810) {
                            length = stream.readInt();
                        }
                        blocks = [];
                        for (let i = 0; i < length; i++) {
                            if (version < this.GCC_VER_810) {
                                stream.readInt();
                            }
                            blocks.push(new Block());
                        }
                        this.gcnoFunction!.numBlocks = length;
                        break;
                    case this.GCOV_TAG_ARCS:
                        const srcBlockIdx = stream.readInt();
                        const arcs: Arc[] = [];
                        for (let i = 0; i < (length - 1) / 2; i++) {
                            const dstBlockIdx = stream.readInt();
                            const flag = stream.readInt();
                            const arc = new Arc(srcBlockIdx, dstBlockIdx, flag, blocks!);
                            arcs.push(arc);
                        }
                        let block = blocks![srcBlockIdx];
                        for (const arc of arcs) {
                            block.exitArcs.push(arc);
                            block.successCount++;
                            arc.dstBlock.entryArcs.push(arc);
                            arc.dstBlock.predictionsCount++;
                            if (arc.isFake) {
                                if (arc.srcBlock != null) {
                                    block = blocks![srcBlockIdx];
                                    block.isCallSite = true;
                                }
                            }
                        }
                        this.gcnoFunction!.functionBlocks = blocks!;
                        break;
                    case this.GCOV_TAG_LINES:
                        const blockNumber = stream.readInt();
                        const lineNumbers: number[] = [];
                        let index: number = 0;
                        while (true) {
                            const lineNumber = stream.readInt();
                            if (lineNumber !== 0) {
                                if (index === 0) {
                                    lineNumbers[index++] = 0;
                                    lineNumbers[index++] = source!.index;
                                }
                                lineNumbers[index++] = lineNumber;
                                if (lineNumber >= source!.linesCount) {
                                    source!.linesCount = lineNumber + 1;
                                }
                            } else {
                                const fileName = stream.readString();
                                if (fileName === '') {
                                    break;
                                }
                                source = this.findOrAdd(fileName);
                                lineNumbers[index++] = 0;
                                lineNumbers[index++] = source!.index;
                            }
                        }
                        this.gcnoFunction!.functionBlocks[blockNumber].blockLines = lineNumbers;
                        this.gcnoFunction!.functionBlocks[blockNumber].lineNumber = index;
                        break;
                    default: {
                        break;
                    }
                }
            } catch (RangeException) {
                this.gcnoFunction!.functionBlocks = blocks!;
                this.gcnoFunctions.push(this.gcnoFunction!);
                break;
            }
        }
    }

    public getFunctions(): GcnoFunction[] {
        return this.gcnoFunctions;
    }

    private findOrAdd(fileName: string): SourceFile {
        let sourceFile = this.sourceMap.get(fileName);
        if (sourceFile == null) {
            sourceFile = new SourceFile(fileName, this.sources.length + 1);
            this.sources.push(sourceFile);
            this.sourceMap.set(fileName, sourceFile);
        }
        return sourceFile;
    }
}
