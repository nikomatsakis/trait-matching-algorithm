load("testLib.js");
load("type.js");
load("trait.js");

(function basicSuccess() {
  expectSuccess(function() {
    var intType = new Type("int", []);
    var floatType = new Type("float", []);
    var stringType = new Type("string", []);

    var env = new Environment();

    var program = new Program([
      new Impl("ToStrInt", [], new TraitReference("ToStr", [], intType)),
      new Impl("ToStrFloat", [], new TraitReference("ToStr", [], floatType))
    ]);

    var result =
      resolve(program, env, [new TraitReference("ToStr", [], intType),
                             new TraitReference("ToStr", [], floatType),
                             new TraitReference("ToStr", [], stringType)]);

    assertEq(result.confirmed.length, 2);
    assertEq(result.confirmed[0].impl.id, "ToStrInt");
    assertEq(result.confirmed[0].traitReference.selfType.id, "int");
    assertEq(result.confirmed[1].impl.id, "ToStrFloat");
    assertEq(result.confirmed[1].traitReference.selfType.id, "float");
    assertEq(result.errors.length, 1);
    assertEq(result.errors[0].selfType.id, "string");
  });
})();

printSummary();
