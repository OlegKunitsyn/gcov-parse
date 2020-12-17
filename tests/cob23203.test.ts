import * as assert from "assert";
import * as path from "path";
import * as gcov from "../src/gcov";

suite("cob23203", () => {
    const dir = path.resolve("resources/cob23203");
    const actual = gcov.parse([
        path.resolve(dir, "cob23203_0"),
        path.resolve(dir, "cob23203_1"),
        path.resolve(dir, "cob23203_2")
    ]);
    test("length", () => {
        assert.strictEqual(actual.length, 243);
    });
    test("file", () => {
        assert.strictEqual(actual[0].file, "/tmp/cob23203_0.c");
        assert.strictEqual(actual[85].file, "/tmp/cob23203_1.c");
        assert.strictEqual(actual[168].file, "/tmp/cob23203_2.c");
    });
    test("line executed", () => {
        assert.strictEqual(actual[0].line, 33);
        assert.strictEqual(actual[0].executed, true);
        assert.strictEqual(actual[85].line, 38);
        assert.strictEqual(actual[85].executed, true);
        assert.strictEqual(actual[168].line, 38);
        assert.strictEqual(actual[168].executed, true);
    });
    test("line executed twice", () => {
        assert.strictEqual(actual[6].line, 60);
        assert.strictEqual(actual[6].executed, true);
        assert.strictEqual(actual[90].line, 52);
        assert.strictEqual(actual[90].executed, true);
        assert.strictEqual(actual[173].line, 52);
        assert.strictEqual(actual[173].executed, true);
    });
    test("line not executed", () => {
        assert.strictEqual(actual[9].line, 63);
        assert.strictEqual(actual[9].executed, false);
        assert.strictEqual(actual[88].line, 45);
        assert.strictEqual(actual[88].executed, false);
        assert.strictEqual(actual[177].line, 63);
        assert.strictEqual(actual[177].executed, false);
    });
});