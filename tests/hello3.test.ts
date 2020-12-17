import * as assert from "assert";
import * as path from "path";
import * as gcov from "../src/gcov";

suite("hello3", () => {
    const dir = path.resolve("resources/hello3");
    const actual = gcov.parse([path.resolve(dir, "hello3")]);
    test("length", () => {
        assert.strictEqual(actual.length, 90);
    });
    test("file", () => {
        assert.strictEqual(actual[0].file, "/home/olegs/projects/gnucobol-debug/test/resources/hello3.cbl");
        assert.strictEqual(actual[4].file, "/home/olegs/projects/gnucobol-debug/test/resources/hello3.c");
    });
    test("line executed", () => {
        assert.strictEqual(actual[0].line, 6);
        assert.strictEqual(actual[0].executed, true);
        assert.strictEqual(actual[4].line, 31);
        assert.strictEqual(actual[4].executed, true);
    });
    test("line executed twice", () => {
        assert.strictEqual(actual[1].line, 7);
        assert.strictEqual(actual[1].executed, true);
        assert.strictEqual(actual[9].line, 50);
        assert.strictEqual(actual[9].executed, true);
    });
    test("line not executed", () => {
        assert.strictEqual(actual[12].line, 60);
        assert.strictEqual(actual[12].executed, false);
    });
});