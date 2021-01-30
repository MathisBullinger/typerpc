const Person = { name: String, age: Number }
module.exports = {
  greet: {},
  add: { params: [Number, Number], result: Number },
  concat: { params: [String, String], result: String },
  capitalize: { params: String, result: String },
  person: { params: [String, Number], result: Person },
  age: { params: Person, result: Person },
  older: { params: Object, result: Person },
}
