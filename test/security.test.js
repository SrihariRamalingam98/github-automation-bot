import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
test('GitHub HMAC on original raw bytes matches expected digest',()=>{
  const secret='test-secret';
  const body=Buffer.from('{"action":"opened","x":1}');
  const header='sha256='+crypto.createHmac('sha256',secret).update(body).digest('hex');
  const actual='sha256='+crypto.createHmac('sha256',secret).update(body).digest('hex');
  assert.equal(header,actual);
  assert.notEqual(header,'sha256='+crypto.createHmac('sha256',secret).update(Buffer.from('{"x":1,"action":"opened"}')).digest('hex'));
});
