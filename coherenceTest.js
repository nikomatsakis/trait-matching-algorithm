load("testLib.js");
load("type.js");
load("trait.js");
load("coherence.js");

(function basicCoherenceDup() {
  expectSuccess(function() {
    var intType = new Type("int", []);

    var env = new Environment();

    var program = new Program(
      [],
      [
        new Impl("ToStrInt1", [], new TraitReference("ToStr", [], intType)),
        new Impl("ToStrInt2", [], new TraitReference("ToStr", [], intType)),
      ]);

    var conflicts = coherenceCheck(program);

    var expectedConflicts = [["ToStrInt1", "ToStrInt2"]];
    assertEq(JSON.stringify(expectedConflicts, undefined, 2),
             JSON.stringify(conflicts, undefined, 2));
  });
})();

(function basicCoherenceOK() {
  expectSuccess(function() {
    var intType = new Type("int", []);
    var strType = new Type("str", []);

    var env = new Environment();

    var program = new Program(
      [],
      [
        new Impl("ToStrInt", [], new TraitReference("ToStr", [], intType)),
        new Impl("ToStrStr", [], new TraitReference("ToStr", [], strType)),
      ]);

    var conflicts = coherenceCheck(program);

    var expectedConflicts = [];
    assertEq(JSON.stringify(expectedConflicts, undefined, 2),
             JSON.stringify(conflicts, undefined, 2));
  });
})();

(function openEndedImpl() {
  // Test that `impl<T> ToStr for T` conflicts with `impl ToStr for int`
  expectSuccess(function() {
    var intType = new Type("int", []);
    var p0Type = new TypeParameter(0);
    var p0Def = new TypeParameterDef(0, []);

    var env = new Environment();

    var program = new Program(
      [],
      [
        new Impl("ToStrInt", [], new TraitReference("ToStr", [], intType)),
        new Impl("ToStrAny", [p0Def], new TraitReference("ToStr", [], p0Type)),
      ]);

    var conflicts = coherenceCheck(program);

    var expectedConflicts = [["ToStrInt", "ToStrAny"]];
    assertEq(JSON.stringify(expectedConflicts, undefined, 2),
             JSON.stringify(conflicts, undefined, 2));
  });
})();

(function twoOpenEndedImpls() {
  // Test that
  //   `impl<T:Foo> ToStr for T`
  // conflicts with
  //   `impl<U:Bar> ToStr for U`
  expectSuccess(function() {
    var intType = new Type("int", []);

    var TType = new TypeParameter(0);
    var TDef = new TypeParameterDef(0, [new TraitReference("Foo", [], TType)]);

    var UType = new TypeParameter(0);
    var UDef = new TypeParameterDef(0, [new TraitReference("Bar", [], UType)]);

    var env = new Environment();

    var program = new Program(
      [],
      [
        new Impl("ToStrFoo", [TDef], new TraitReference("ToStr", [], TType)),
        new Impl("ToStrBar", [UDef], new TraitReference("ToStr", [], UType)),
      ]);

    var conflicts = coherenceCheck(program);

    var expectedConflicts = [["ToStrFoo", "ToStrBar"]];
    assertEq(JSON.stringify(expectedConflicts, undefined, 2),
             JSON.stringify(conflicts, undefined, 2));
  });
})();

(function qualifiedImpl() {
  // Test that `impl<T:Foo> ToStr for T` does not conflict `impl ToStr for int`,
  // because Int does not implement Foo
  expectSuccess(function() {
    var intType = new Type("int", []);
    var p0Type = new TypeParameter(0);
    var p0Def = new TypeParameterDef(0, [new TraitReference("Foo", [], p0Type)]);

    var env = new Environment();

    var program = new Program(
      [],
      [
        new Impl("ToStrInt", [], new TraitReference("ToStr", [], intType)),
        new Impl("ToStrAnyFoo", [p0Def], new TraitReference("ToStr", [], p0Type)),
      ]);

    var conflicts = coherenceCheck(program);

    var expectedConflicts = [];
    assertEq(JSON.stringify(expectedConflicts, undefined, 2),
             JSON.stringify(conflicts, undefined, 2));
  });
})();

printSummary();
