describe('Test:', function () {

  beforeEach(function () {
    var a = function () {}
    a()
  })

  describe('subdescribe:', function () {

    before(function (done) {
      setTimeout(function () {
        done()
      }, 0)
    })

    it('should execute', function() {
      function foobar () {
        return 'bar'
      }
      var foo = foobar()
    });


    it('will fail', function() {
      // here is the first line
      throw new Error('Foobar')

      function justForFun () {
        return 'A method with senseless content'
      }
    })


    it('will fail second time', function() {
      // here is the first line
      throw new Error('Foobar test')

      function justForFun () {
        return 'A method with senseless content'
      }
    });

  })

})
