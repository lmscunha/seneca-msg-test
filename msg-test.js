/* Copyright (c) 2018 voxgig and other contributors, MIT License */
'use strict'


const Util = require('util')

const Jsonic = require('jsonic')
const Inks = require('inks')
const Optioner = require('optioner')
const Joi = Optioner.Joi



module.exports = msg_test
module.exports.Joi = Joi


const optioner = Optioner({
  test: Joi.boolean().default(true),
  data: Joi.object().unknown().default({}),
  context: Joi.object().unknown().default({}),
  fix: Joi.string().default(''),
  calls: Joi.array().items(Joi.object({
    name: Joi.string().min(1),
    print: Joi.boolean().default(false),
    print_context: Joi.boolean().default(false),
    pattern: Joi.string().min(3),
    params: Joi.object().unknown().default({}),
    out: Joi.alternatives().try(Joi.object().unknown(),Joi.array()),
    err: Joi.object().unknown(),
  }))
})

function msg_test(seneca, spec) {
  spec = optioner.check(spec)

  return function(fin) {
    if(spec.test) {
      seneca
        .test(fin)
    }

    // TODO: make optional
    var datajson = JSON.stringify(spec.data)

    seneca
      .act(
        'role:mem-store,cmd:import',
        { json: datajson, default$: {} },
        function() {
          seneca = this

          const foundmsgs = seneca
                .list(spec.fix)
                .map(msg=>seneca.util.pattern(msg))

          const specmsgs = {}

          spec.calls.forEach(call=>{
            var specmsg = seneca.util.pattern(Jsonic(spec.fix+','+call.pattern))
            specmsgs[specmsg] = true
          })

          for(var i = 0; i < foundmsgs.length; i++) {
            var msg = foundmsgs[i]
            if(null == specmsgs[msg]) {
              return fin(new Error('Test calls not defined for: '+msg))
            }
          }


          var callmap = spec.context
          next_call(0)
          
          function next_call(call_index) {
            if(spec.calls.length <= call_index) {
              return fin()
            }

            var call = spec.calls[call_index]

            if(false === call.run) {
              return setImmediate(next_call.bind(null,call_index+1))
            }

            var params = {}
            Object.keys(call.params).forEach(function(pk) {
              var pv = call.params[pk]

              pk = Inks(pk,callmap)
              if('string' === typeof pv) {
                pv = Inks(pv,callmap)
              }
              
              params[pk] = pv
            })

            var print = spec.print || call.print
            
            if(print) {
              console.log('\n\nCALL   : ', call.pattern, params)
            }

            if(call.print_context) {
              console.dir(callmap, {depth:3,colors:true})
            }
            
            var msg = Object.assign(
              {},
              params,
              Jsonic(call.pattern),
              Jsonic(spec.fix)
            )
            var msgstr = Jsonic.stringify(msg)
            
            seneca.act(msg, function(err, out, meta) {
              if(print) {
                console.log('ERROR  : ', err)
                console.log('RESULT : ', Util.inspect(out,{depth:null,colors:true}))
              }

              if(null == call.err) {
                if(null != err ) {
                  return fin(new Error('Error not expected for: '+
                                       msgstr+', err: '+err))
                }
              }
              else {
                if(null == err ) {
                  return fin(new Error('Error expected for: '+
                                       msgstr+', was null'))
                }

          
                var result = Optioner(call.err,{must_match_literals:true})(err)
                if(result.error) {
                  return fin(result.error)
                }
              }
              
              if(null == call.out) {
                if(null != out ) {
                  return fin(new Error('Output not expected for: '+
                                       msgstr+', out: '+out))
                }
              }
              else {
                if(null == out ) {
                  return fin(new Error('Output expected for: '+
                                       msgstr+', was null'))
                }


                var result = Optioner(call.out,{must_match_literals:true})(out)
                if(result.error) {
                  return fin(new Error('Output for: '+msgstr+
                                       ' was invalid: '+result.error.message))
                }
              }

              if(call.name) {
                callmap[call.name] = {
                  fix: spec.fix,
                  pattern: call.pattern,
                  params: params,
                  msg: msg,
                  err: err,
                  out: out,
                  meta: meta
                }
              }
              
              setImmediate(next_call.bind(null,call_index+1))
            })
          }
        })
  }
}