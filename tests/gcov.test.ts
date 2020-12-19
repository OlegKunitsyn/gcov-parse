import * as assert from "assert";
import * as path from "path";
import * as gcov from "../src/gcov";

suite("gcov", () => {
    const resources = path.resolve("resources");
    test("simple", () => {
        const coverages = gcov.parse([path.resolve(resources, "hello")]);

        assert.strictEqual(coverages.length, 1);
        assert.strictEqual(coverages[0].file, "/tmp/cob9908_0.c");

        assert.strictEqual(coverages[0].executed, 60);
        assert.strictEqual(coverages[0].instrumented, 68);

        assert.strictEqual(coverages[0].lines[0].line, 33);
        assert.strictEqual(coverages[0].lines[0].executed, true);

        assert.strictEqual(coverages[0].lines[9].line, 63);
        assert.strictEqual(coverages[0].lines[9].executed, false);

    });
    test("inclusive", () => {
        const coverages = gcov.parse([path.resolve(resources, "hello3")]);

        assert.strictEqual(coverages.length, 2);

        // hello3.c
        assert.strictEqual(coverages[0].file, "hello3.c");
        assert.strictEqual(coverages[0].executed, 75);
        assert.strictEqual(coverages[0].instrumented, 86);
        assert.strictEqual(coverages[0].lines[0].line, 31);
        assert.strictEqual(coverages[0].lines[0].executed, true);
        assert.strictEqual(coverages[0].lines[8].line, 60);
        assert.strictEqual(coverages[0].lines[8].executed, false);

        // hello3.cbl
        assert.strictEqual(coverages[1].file, "/home/olegs/projects/gnucobol-debug/test/resources/hello3.cbl");
        assert.strictEqual(coverages[1].executed, 4);
        assert.strictEqual(coverages[1].instrumented, 4);
        assert.strictEqual(coverages[1].lines[0].line, 6);
        assert.strictEqual(coverages[1].lines[0].executed, true);
    });
    test("multiple", () => {
        const coverages = gcov.parse([
            path.resolve(resources, "cob23203_0"),
            path.resolve(resources, "cob23203_1"),
            path.resolve(resources, "cob23203_2")
        ]);

        assert.strictEqual(coverages.length, 3);

        // cob23203_0.c
        assert.strictEqual(coverages[0].file, "/tmp/cob23203_0.c");
        assert.strictEqual(coverages[0].instrumented, 85);
        assert.strictEqual(coverages[0].executed, 77);
        assert.strictEqual(coverages[0].lines[0].line, 33);
        assert.strictEqual(coverages[0].lines[0].executed, true);
        assert.strictEqual(coverages[0].lines[9].line, 63);
        assert.strictEqual(coverages[0].lines[9].executed, false);

        // cob23203_1.c
        assert.strictEqual(coverages[1].file, "/tmp/cob23203_1.c");
        assert.strictEqual(coverages[1].instrumented, 83);
        assert.strictEqual(coverages[1].executed, 69);
        assert.strictEqual(coverages[1].lines[0].line, 38);
        assert.strictEqual(coverages[1].lines[0].executed, true);
        assert.strictEqual(coverages[1].lines[3].line, 45);
        assert.strictEqual(coverages[1].lines[3].executed, false);

        // cob23203_2.c
        assert.strictEqual(coverages[2].file, "/tmp/cob23203_2.c");
        assert.strictEqual(coverages[2].instrumented, 75);
        assert.strictEqual(coverages[2].executed, 62);
        assert.strictEqual(coverages[2].lines[0].line, 38);
        assert.strictEqual(coverages[2].lines[0].executed, true);
        assert.strictEqual(coverages[2].lines[3].line, 45);
        assert.strictEqual(coverages[2].lines[3].executed, false);
    });
});