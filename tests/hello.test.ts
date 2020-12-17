import * as assert from "assert";
import * as path from "path";
import * as gcov from "../src/gcov";

suite("hello", () => {
    const dir = path.resolve("resources/hello");
    const actual = gcov.parse([path.resolve(dir, "hello")]);
    test("length", () => {
        assert.strictEqual(actual.length, 68);
    });
    test("file", () => {
        assert.strictEqual(actual[0].file, "/tmp/cob9908_0.c");
    });
    test("line executed", () => {
        assert.strictEqual(actual[0].line, 33);
        assert.strictEqual(actual[0].executed, true);
    });
    test("line executed twice", () => {
        assert.strictEqual(actual[6].line, 60);
        assert.strictEqual(actual[6].executed, true);
    });
    test("line not executed", () => {
        assert.strictEqual(actual[65].line, 175);
        assert.strictEqual(actual[65].executed, false);
    });
});