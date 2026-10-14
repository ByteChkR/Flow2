import {scalarNames} from '@adam-flow/core/flow-core/index.js';
import type {BrowserCodecRegistry} from './codecs.js';

export function registerScalarCodecs(codecs:BrowserCodecRegistry):void {
  for(const name of scalarNames)codecs.register({
    definition:{typeId:name,version:1,valueType:{kind:'scalar',name},wireSchema:{$schema:'https://json-schema.org/draft/2020-12/schema',type:name==='core.Bool'?'boolean':name==='core.Integer'?'integer':'string'}},
    encode:value=>value,decode:payload=>payload,
  });
}
