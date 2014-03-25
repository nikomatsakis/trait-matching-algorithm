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

  // impl<A> Deref<A> for Ref<A>
  var ImplDerefForRef = new Impl(
    "DerefForRef", [ADef],
    new TraitReference(DEREF_TRAIT.id, [A], Ref(A)));

  // impl<A> Deref<A> for RefMut<A>
  var ImplDerefForRefMut = new Impl(
    "DerefForRefMut", [ADef],
    new TraitReference(DEREF_TRAIT.id, [A], RefMut(A)));

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

  // impl<A> DerefMut<A> for RefMut<A>
  var ImplDerefMutForRefMut = new Impl(
    "DerefMutForRefMut", [ADef],
    new TraitReference(DEREF_MUT_TRAIT.id, [A], RefMut(A)));

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
    new Method("ref_mut", RefMut(TestSelf)),
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
      ImplDerefForHeap, ImplDerefForGc, ImplDerefForGc,
      ImplDerefForRef, ImplDerefForRefMut,
      ImplDerefMutForHeap, ImplDerefMutForRefMut,
      ImplTestForInt
    ]);

  return {int: int,
          Heap: Heap,
          env: env,
          program: program,
          TestTrait: TestTrait};
}

(function byValueInt() {
  expectSuccess(function() {
    var {env, program, int, TestTrait, Heap} = setup();
    var r = resolveMethod(program, env, int, [TestTrait], "val");
    assertEq(r.success, true);
    assertEq(r.adjustedType.toString(), "NoAdjustment(int)");
  });
})();

(function byValueRefInt() {
  expectSuccess(function() {
    var {env, program, int, TestTrait, Heap} = setup();
    var r = resolveMethod(program, env, Ref(int), [TestTrait], "val");
    assertEq(r.success, true);
    assertEq(r.adjustedType.toString(),
             "DerefAdjustment(NoAdjustment(Ref<int>), Deref -> ${0:int})");
  });
})();

print("--------------------------------------------------");

(function byValueRefInt() {
  expectSuccess(function() {
    var {env, program, int, TestTrait, Heap} = setup();
    var r = resolveMethod(program, env, Ref(int), [TestTrait], "ref");
    print(r);
  });
})();

