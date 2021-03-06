'use strict';

/**
 * Test dependencies.
 */

const start = require('./common');
const assert = require('power-assert');

const mongoose = start.mongoose;
const Schema = mongoose.Schema;

describe('model middleware', function() {
  var db;

  before(function() {
    db = start();
  });

  after(function(done) {
    db.close(done);
  });

  it('post save', function(done) {
    var schema = new Schema({
      title: String
    });

    var called = 0;

    schema.post('save', function(obj) {
      assert.equal(obj.title, 'Little Green Running Hood');
      assert.equal(this.title, 'Little Green Running Hood');
      assert.equal(called, 0);
      called++;
    });

    schema.post('save', function(obj) {
      assert.equal(obj.title, 'Little Green Running Hood');
      assert.equal(this.title, 'Little Green Running Hood');
      assert.equal(called, 1);
      called++;
    });

    schema.post('save', function(obj, next) {
      assert.equal(obj.title, 'Little Green Running Hood');
      assert.equal(called, 2);
      called++;
      next();
    });

    const db = start();
    const TestMiddleware = db.model('TestPostSaveMiddleware', schema);

    const test = new TestMiddleware({title: 'Little Green Running Hood'});

    test.save(function(err) {
      assert.ifError(err);
      assert.equal(test.title, 'Little Green Running Hood');
      assert.equal(called, 3);
      db.close();
      done();
    });
  });

  it('sync error in post save (gh-3483)', function(done) {
    var schema = new Schema({
      title: String
    });

    schema.post('save', function() {
      throw new Error('woops!');
    });

    const TestMiddleware = db.model('gh3483_post', schema);

    const test = new TestMiddleware({ title: 'Test' });

    test.save(function(err) {
      assert.ok(err);
      assert.equal(err.message, 'woops!');
      done();
    });
  });

  it('pre hook promises (gh-3779)', function(done) {
    const schema = new Schema({
      title: String
    });

    let calledPre = 0;
    schema.pre('save', function() {
      return new Promise(resolve => {
        setTimeout(() => {
          ++calledPre;
          resolve();
        }, 100);
      });
    });

    const TestMiddleware = db.model('gh3779_pre', schema);

    const test = new TestMiddleware({ title: 'Test' });

    test.save(function(err) {
      assert.ifError(err);
      assert.equal(calledPre, 1);
      done();
    });
  });

  it('post hook promises (gh-3779)', function(done) {
    const schema = new Schema({
      title: String
    });

    schema.post('save', function(doc) {
      return new Promise(resolve => {
        setTimeout(() => {
          doc.title = 'From Post Save';
          resolve();
        }, 100);
      });
    });

    const TestMiddleware = db.model('gh3779_post', schema);

    const test = new TestMiddleware({ title: 'Test' });

    test.save(function(err, doc) {
      assert.ifError(err);
      assert.equal(doc.title, 'From Post Save');
      done();
    });
  });

  it('validate middleware runs before save middleware (gh-2462)', function(done) {
    var schema = new Schema({
      title: String
    });
    var count = 0;

    schema.pre('validate', function(next) {
      assert.equal(count++, 0);
      next();
    });

    schema.pre('save', function(next) {
      assert.equal(count++, 1);
      next();
    });

    var db = start();
    var Book = db.model('gh2462', schema);

    Book.create({}, function() {
      assert.equal(count, 2);
      db.close(done);
    });
  });

  it('works', function(done) {
    var schema = new Schema({
      title: String
    });

    var called = 0;

    schema.pre('init', function() {
      called++;
    });

    schema.pre('save', function(next) {
      called++;
      next(new Error('Error 101'));
    });

    schema.pre('remove', function(next) {
      called++;
      next();
    });

    mongoose.model('TestMiddleware', schema);

    var db = start(),
        TestMiddleware = db.model('TestMiddleware');

    var test = new TestMiddleware();

    test.init({ title: 'Test' }, function(err) {
      assert.ifError(err);
      assert.equal(called, 1);

      test.save(function(err) {
        assert.ok(err instanceof Error);
        assert.equal(err.message, 'Error 101');
        assert.equal(called, 2);

        test.remove(function(err) {
          db.close();
          assert.ifError(err);
          assert.equal(called, 3);
          done();
        });
      });
    });
  });

  it('post init', function(done) {
    var schema = new Schema({
      title: String
    });

    var preinit = 0,
        postinit = 0;

    schema.pre('init', function() {
      ++preinit;
    });

    schema.post('init', function(doc) {
      assert.ok(doc instanceof mongoose.Document);
      ++postinit;
    });

    mongoose.model('TestPostInitMiddleware', schema);

    var db = start(),
        Test = db.model('TestPostInitMiddleware');

    var test = new Test({title: 'banana'});

    test.save(function(err) {
      assert.ifError(err);

      Test.findById(test._id, function(err, test) {
        assert.ifError(err);
        assert.equal(preinit, 1);
        assert.equal(postinit, 1);
        test.remove(function() {
          db.close();
          done();
        });
      });
    });
  });

  it('gh-1829', function(done) {
    var childSchema = new mongoose.Schema({
      name: String
    });

    var childPreCalls = 0;
    var childPreCallsByName = {};
    var parentPreCalls = 0;

    childSchema.pre('save', function(next) {
      childPreCallsByName[this.name] = childPreCallsByName[this.name] || 0;
      ++childPreCallsByName[this.name];
      ++childPreCalls;
      next();
    });

    var parentSchema = new mongoose.Schema({
      name: String,
      children: [childSchema]
    });

    parentSchema.pre('save', function(next) {
      ++parentPreCalls;
      next();
    });

    var db = start();
    var Parent = db.model('gh-1829', parentSchema, 'gh-1829');

    var parent = new Parent({
      name: 'Han',
      children: [
        {name: 'Jaina'},
        {name: 'Jacen'}
      ]
    });

    parent.save(function(error) {
      assert.ifError(error);
      assert.equal(childPreCalls, 2);
      assert.equal(childPreCallsByName.Jaina, 1);
      assert.equal(childPreCallsByName.Jacen, 1);
      assert.equal(parentPreCalls, 1);
      parent.children[0].name = 'Anakin';
      parent.save(function(error) {
        assert.ifError(error);
        assert.equal(childPreCalls, 4);
        assert.equal(childPreCallsByName.Anakin, 1);
        assert.equal(childPreCallsByName.Jaina, 1);
        assert.equal(childPreCallsByName.Jacen, 2);

        assert.equal(parentPreCalls, 2);
        db.close();
        done();
      });
    });
  });

  it('sync error in pre save (gh-3483)', function(done) {
    var schema = new Schema({
      title: String
    });

    schema.post('save', function() {
      throw new Error('woops!');
    });

    const TestMiddleware = db.model('gh3483_pre', schema);

    const test = new TestMiddleware({ title: 'Test' });

    test.save(function(err) {
      assert.ok(err);
      assert.equal(err.message, 'woops!');
      done();
    });
  });

  it('sync error in pre save after next() (gh-3483)', function(done) {
    var schema = new Schema({
      title: String
    });

    var called = 0;

    schema.pre('save', function(next) {
      next();
      // This error will not get reported, because you already called next()
      throw new Error('woops!');
    });

    schema.pre('save', function(next) {
      ++called;
      next();
    });

    const TestMiddleware = db.model('gh3483_pre_2', schema);

    const test = new TestMiddleware({ title: 'Test' });

    test.save(function(error) {
      assert.ifError(error);
      assert.equal(called, 1);
      done();
    });
  });

  it('validate + remove', function(done) {
    var schema = new Schema({
      title: String
    });

    var preValidate = 0,
        postValidate = 0,
        preRemove = 0,
        postRemove = 0;

    schema.pre('validate', function(next) {
      ++preValidate;
      next();
    });

    schema.pre('remove', function(next) {
      ++preRemove;
      next();
    });

    schema.post('validate', function(doc) {
      assert.ok(doc instanceof mongoose.Document);
      ++postValidate;
    });

    schema.post('remove', function(doc) {
      assert.ok(doc instanceof mongoose.Document);
      ++postRemove;
    });

    var db = start(),
        Test = db.model('TestPostValidateMiddleware', schema);

    var test = new Test({title: 'banana'});

    test.save(function(err) {
      assert.ifError(err);
      assert.equal(preValidate, 1);
      assert.equal(postValidate, 1);
      assert.equal(preRemove, 0);
      assert.equal(postRemove, 0);
      test.remove(function(err) {
        db.close();
        assert.ifError(err);
        assert.equal(preValidate, 1);
        assert.equal(postValidate, 1);
        assert.equal(preRemove, 1);
        assert.equal(postRemove, 1);
        done();
      });
    });
  });
});
