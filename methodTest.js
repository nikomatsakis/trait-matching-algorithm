load("testLib.js");
load("type.js");
load("trait.js");
load("method.js");

function setup() {
  // int
  var int = new Type("int", []);

  // struct Heap<T>
  var Heap = t => new Type("Heap", [t]);

  // struct Gc<T>
  var Gc = t => new Type("Gc", [t]);

  // Useful type parameter: <A>
  var A = new TypeParameter(0);
  var ADef = new TypeParameterDef(0, []);

  // impl<A> Deref<A> for Heap<A>
  var ImplDerefForHeap = new Impl(
    "DerefForHeap", [ADef],
    new TraitReference(DEREF_TRAIT.id, [A], Heap(A)));

  // impl<A> Deref<A> for Gc<A>
  var ImplDerefForGc = new Impl(
    "DerefGc", [ADef],
    new TraitReference(DEREF_TRAIT.id, [A], Gc(A)));

  // impl<A> DerefMut<A> for Heap<A>
  var ImplDerefMutForHeap = new Impl(
    "DerefMutForHeap", [ADef],
    new TraitReference(DEREF_MUT_TRAIT.id, [A], Heap(A)));

  // trait Test {
  //   fn val(Self);
  //   fn ref(&Self);
  //   fn heap(Heap<Self>);
  //   fn gc(Gc<Self>);
  // }
  var TestSelf = new TypeParameter(0);
  var TestTrait = new Trait("Test", [true], [
    new Method("val", TestSelf),
    new Method("ref", Ref(TestSelf)),
    new Method("heap", Heap(TestSelf)),
    new Method("gc", Gc(TestSelf)),
  ]);

  // impl Test for int
  var ImplTestForInt = new Impl(
    "TestForInt", [],
    new TraitReference("Test", [], int));

  var env = new Environment();
  var program = new Program(
    [
      DEREF_TRAIT,
      DEREF_MUT_TRAIT,
      "Test"
    ],
    [
      ImplDerefForHeap, ImplDerefForGc,
      ImplDerefMutForHeap,
      ImplTestForInt
    ]);

  return {int: int,
          Heap: Heap,
          env: env,
          program: program,
          TestTrait: TestTrait};
}

(function basicSearch() {
  expectSuccess(function() {
    var {env, program, int, TestTrait, Heap} = setup();
    var r = resolveMethod(program, env, int, [TestTrait], "val");
    print("Result: ", r);
  });
})();

