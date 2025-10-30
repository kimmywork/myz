const { execFile } = require("child_process");
const path = require("path");

jest.setTimeout(20000);

test("repro: create A/B/C, delete A, reapply B/C", (done) => {
  const reproPath = path.resolve(__dirname, "..", "repro.js");
  execFile(
    "node",
    [reproPath],
    { cwd: path.resolve(__dirname, "..") },
    (err, stdout, stderr) => {
      if (err) {
        console.error("repro stderr:", stderr);
      }
      try {
        expect(err).toBeNull();
        // Expect final reapply to have both highlights 2 and 3 present
        expect(stdout).toMatch(/After reapplying C/);
        expect(stdout).toMatch(/data-highlight-id="myz_test_2"/);
        expect(stdout).toMatch(/data-highlight-id="myz_test_3"/);
        done();
      } catch (e) {
        done(e);
      }
    },
  );
});
