var TESTS_PASSED = 0;
var TESTS_FAILED = 0;

function testName() {
  // Extract the name of the function who called `expectError` or `expectSuccess`

  // I am a horrible monster who prays for death
  return testName.caller.caller.name;
}

function expectError(func) {
  try {
    func();
  } catch (e) {
    TESTS_PASSED++;
    return;
  }
  print(testName() + ": Expected error did not occur.");
  TESTS_FAILED++;
}

function expectResult(expected, func) {
  var actual = func();
  if (actual !== expected) {
    print(testName() + ": unexpected result occurred ("+actual+" vs "+expected+")");
    TESTS_FAILED++;
  } else {
    TESTS_PASSED++;
  }
}

function expectSuccess(func) {
  func();
  TESTS_PASSED++;
}

function printSummary() {
  if (TESTS_PASSED)
    print(TESTS_PASSED, "tests passed.");

  if (TESTS_FAILED)
    print(TESTS_FAILED, "tests FAILED.");
}
