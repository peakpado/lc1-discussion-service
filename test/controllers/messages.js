'use strict';

var should = require('should');
var assert = require('assert');
var request = require('supertest');
var async = require('async');
var config = require('config');

var datasource = require('./../../datasource');
datasource.init(config);
var db = datasource.getDataSource();
var sequelize = db.sequelize;
// turn of sequelize logging.
sequelize.options.logging = false;
var Discussion = db.Discussion;
var Message = db.Message;

// delete data created during test.
function cleanup(done) {
  async.waterfall([
    function(callback) {
      Message.findAll().success(function(messages) {
        async.each(messages, function(m, cb) {
          m.destroy().done(cb);
        }, callback);
      }).error(callback);
    },
    function(callback) {
      Discussion.findAll().success(function(discussions) {
        async.each(discussions, function(d, cb) {
          d.destroy().done(cb);
        }, callback);
      }).error(callback);
    },
  ], function(err) {
    done(err);
  });
}


describe('Messages Controller', function() {
  this.timeout(15000);
  var url = 'http://localhost:'+config.app.port;
  var discussion;
  var message;
  var reqData;

  beforeEach(function(done) {
    // cleanup data from previous test
    cleanup(done);
  });

  // create a discussion
  beforeEach(function(done) {
    var discussionData = {
      remoteObjectKey: 'challenge',
      remoteObjectId: 5678
    };
    Discussion.create(discussionData).success(function (createdDiscussion) {
      discussion = createdDiscussion;
      // create top level message
      Message.create({
        content: 'message content',
        discussionId: discussion.id,
        parentMessageId: null
      }).success(function(createdMessage) {
        message = createdMessage;
        // create second level message
        Message.create({
          content: 'message content',
          discussionId: discussion.id,
          parentMessageId: message.id
        }).done(done);
      }).error(done);
    }).error(done);
  });

  beforeEach(function(done) {
    reqData = {
      content: 'message content'
    };
    done();
  });

  describe('Messages API', function() {
    it('should able to create a message with valid data', function(done) {
      // send request
      request(url)
          .post('/discussions/'+discussion.id+'/messages')
          .send(reqData)
          .expect('Content-Type', /json/)
        // end handles the response
          .end(function(err, res) {
            should.not.exist(err);
            // verify response
            res.status.should.equal(200);
            res.body.id.should.be.a.Number;
            res.body.result.success.should.be.true;
            res.body.result.status.should.equal(200);
            done();
          });
    });

    it('should fail to create a message with invalid discussion id', function(done) {
      // send request
      request(url)
          .post('/discussions/'+9999999+'/messages')
          .send(reqData)
          .end(function(err, res) {
            res.status.should.equal(404);
            res.body.result.success.should.be.false;
            res.body.result.status.should.equal(404);
            res.body.result.should.have.property('content');
            done();
          });
    });

    it('should fail to create a message without content', function(done) {
      delete reqData.content;
      // send request
      request(url)
          .post('/discussions/'+discussion.id+'/messages')
          .send(reqData)
          .end(function(err, res) {
            res.status.should.equal(400);
            res.body.result.success.should.be.false;
            res.body.result.status.should.equal(400);
            res.body.result.should.have.property('content');
            done();
          });
    });

    it('should able to get the all messages in a discussion', function(done) {
      // send request
      request(url)
          .get('/discussions/'+discussion.id+'/messages/')
          .end(function(err, res) {
            should.not.exist(err);
            // verify response
            res.status.should.equal(200);
            res.body.success.should.be.true;
            res.body.status.should.equal(200);
            res.body.should.have.property('metadata');
            res.body.metadata.totalCount.should.be.above(0);
            res.body.should.have.property('content');
            res.body.content.length.should.be.above(0);
            done();
          });
    });

    it('should able to get first level messages in the dicsussion', function(done) {
      request(url)
          .get('/discussions/'+discussion.id+'/messages/')
          .end(function(err, res) {
            should.not.exist(err);
            // verify response
            res.status.should.equal(200);
            res.body.success.should.be.true;
            res.body.status.should.equal(200);
            res.body.should.have.property('metadata');
            res.body.metadata.totalCount.should.be.above(0);
            res.body.should.have.property('content');
            res.body.content[0].should.have.property('parentMessageId', null);
            done();
          });
    });

    it('should able to get the partial response for all messages in a discussion using fields parameter', function(done) {
      // send request
      request(url)
          .get('/discussions/'+discussion.id+'/messages?fields=content')
          .end(function(err, res) {
            should.not.exist(err);
            // verify response
            res.status.should.equal(200);
            res.body.success.should.be.true;
            res.body.status.should.equal(200);
            res.body.should.have.property('metadata');
            res.body.metadata.totalCount.should.be.above(0);
            res.body.should.have.property('content');
            res.body.content.length.should.be.above(0);
            res.body.content[0].should.have.property('content');
            res.body.content[0].should.not.have.property('id');
            done();
          });
    });

    it('should able to get the existing message', function(done) {
      // send request
      request(url)
          .get('/discussions/'+discussion.id+'/messages/'+message.id)
          .end(function(err, res) {
            res.status.should.equal(200);
            res.body.success.should.be.true;
            res.body.status.should.equal(200);
            res.body.content.id.should.equal(message.id);
            res.body.content.discussionId.should.equal(discussion.id);
            res.body.content.content.should.equal(reqData.content);
            // res.body.content.should.have.property('messageCount');
            done();
          });
    });

    it('should able to update the existing message', function(done) {
      // send request
      reqData.content = 'updated content';
      request(url)
          .put('/discussions/'+discussion.id+'/messages/'+message.id)
          .send(reqData)
          .end(function(err, res) {
            res.status.should.equal(200);
            res.body.id.should.equal(message.id);
            res.body.result.success.should.be.true;
            res.body.result.status.should.equal(200);
            done();
          });
    });

    it('should able to create a reply message to the existing message', function(done) {
      var replyData = {content: 'reply content'};
      // send request
      request(url)
          .post('/discussions/'+discussion.id+'/messages/'+message.id+'/messages')
          .send(replyData)
          .end(function(err, res) {
            should.not.exist(err);
            // verify response
            res.status.should.equal(200);
            res.body.id.should.be.a.Number;
            res.body.result.success.should.be.true;
            res.body.result.status.should.equal(200);
            done();
          });
    });

    it('should able to get the child messages in a message', function(done) {
      // send request
      request(url)
          .get('/discussions/'+discussion.id+'/messages/'+message.id+'/messages')
          .end(function(err, res) {
            should.not.exist(err);
            // verify response
            res.status.should.equal(200);
            res.body.success.should.be.true;
            res.body.status.should.equal(200);
            res.body.should.have.property('metadata');
            res.body.metadata.totalCount.should.be.above(0);
            res.body.should.have.property('content');
            res.body.content.length.should.be.above(0);
            done();
          });
    });

    it('should able to get nesting messages in a message using fields parameter', function(done) {
      // send request
      request(url)
          .get('/discussions/'+discussion.id+'/messages/'+message.id+'?fields=content,messages(messages,parentMessage)')
          .end(function(err, res) {
            should.not.exist(err);
            // verify response
            res.status.should.equal(200);
            res.body.success.should.be.true;
            res.body.status.should.equal(200);
            res.body.should.have.property('content');
            res.body.content.should.have.property('messages');
            res.body.content.should.not.have.property('id');
            res.body.content.should.have.property('content');
            res.body.content.messages.length.should.be.above(0);
            res.body.content.messages[0].parentMessage.id.should.equal(message.id);
            done();
          });
    });

    it('should able to get partial response of the child messages in a message using fields parameter', function(done) {
      // send request
      request(url)
          .get('/discussions/'+discussion.id+'/messages/'+message.id+'/messages?fields=content')
          .end(function(err, res) {
            should.not.exist(err);
            // verify response
            res.status.should.equal(200);
            res.body.success.should.be.true;
            res.body.status.should.equal(200);
            res.body.should.have.property('metadata');
            res.body.metadata.totalCount.should.be.above(0);
            res.body.should.have.property('content');
            res.body.content.length.should.be.above(0);
            res.body.content[0].should.have.property('content');
            res.body.content[0].should.not.have.property('id');
            done();
          });
    });

    it('should able to delete the existing message', function(done) {
      // send request
      request(url)
          .delete('/discussions/'+discussion.id+'/messages/'+message.id)
          .end(function(err, res) {
            res.status.should.equal(200);
            res.body.id.should.be.a.Number;
            res.body.result.success.should.equal(true);
            res.body.result.status.should.equal(200);
            done();
          });
    });

  });

  afterEach(function(done) {
    // delete data created during test.
    cleanup(done);
  });
});
