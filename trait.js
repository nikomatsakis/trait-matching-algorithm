///////////////////////////////////////////////////////////////////////////

function TraitReference(id, typeParameters, selfType) {
  // Trait<P0...PN> for Type
  this.id = id; // string
  this.typeParameters = typeParameters; // [Type]
  this.selfType = selfType; // Type
}

///////////////////////////////////////////////////////////////////////////

function Impl(id, variables, traitReference) {
  // impl<V1...Vn> Trait<P0...PN> for Type
  this.id = id; // unique string, line number, whatever
  this.variables = variables // [string]
  this.traitReference = traitReference; // [TraitReference]
}

///////////////////////////////////////////////////////////////////////////

function resolve(program, pendingTraitReferences) {
  for (var i = 0; i < pendingTraitReferences.length; i++) {
    var pendingTraitReference = pendingTraitReferences[i];

    for (var j = 0; j < program.impls.length; j++) {
      var impl = program.impls[j];
      if (impl.traitReference.id != pendingTraitReference.id)
        continue;

      
    }
  }
}
