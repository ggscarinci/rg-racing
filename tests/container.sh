#!/usr/bin/env bash
set -euo pipefail
# Uses only the local Docker daemon and an isolated, disposable RG Racing volume.
docker_local() {
  env -u DOCKER_HOST -u DOCKER_CONTEXT -u DOCKER_TLS -u DOCKER_TLS_VERIFY -u DOCKER_CERT_PATH \
    docker --host=unix:///var/run/docker.sock "$@"
}
rg_test_name="rg-racing-test-$$"
rg_test_volume="${rg_test_name}-data"
rg_test_image="${RG_TEST_IMAGE:-rg-racing:validation}"
cleanup() {
  docker_local rm -f "$rg_test_name" >/dev/null 2>&1 || true
  docker_local volume rm "$rg_test_volume" >/dev/null 2>&1 || true
}
trap cleanup EXIT
docker_local volume create "$rg_test_volume" >/dev/null
docker_local run -d --name "$rg_test_name" --network none --read-only \
  --cap-drop ALL --security-opt no-new-privileges:true --tmpfs /tmp:rw,noexec,nosuid,size=16m \
  --mount "type=volume,source=${rg_test_volume},destination=/app/data" \
  -e ADMIN_USERNAME=operador -e ADMIN_PASSWORD=container-validation-only -e SECURE_COOKIES=1 \
  "$rg_test_image" >/dev/null
docker_local exec -i "$rg_test_name" node --input-type=module <<'JS'
import assert from 'node:assert/strict';
let ready=false;
for(let i=0;i<30;i++){
  try{if((await fetch('http://127.0.0.1:3000/health')).ok){ready=true;break;}}catch{}
  await new Promise(r=>setTimeout(r,100));
}
assert.ok(ready,'container did not start');
const login=await fetch('http://127.0.0.1:3000/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'operador',password:process.env.ADMIN_PASSWORD})});
assert.equal(login.status,200);assert.match(login.headers.get('set-cookie'),/Secure/);
const cookie=login.headers.get('set-cookie').split(';')[0];
const state=await (await fetch('http://127.0.0.1:3000/api/state')).json();
assert.equal(state.pilots.length,0);assert.equal(state.events[0].demo,false);
const response=await fetch('http://127.0.0.1:3000/api/admin/command',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json','If-Match':String(state.version),'Idempotency-Key':crypto.randomUUID()},body:JSON.stringify({action:'pilot.add',data:{name:'Container Persistence Test',state:'GO'}})});
assert.equal(response.status,200);
JS
docker_local restart "$rg_test_name" >/dev/null
docker_local exec -i "$rg_test_name" node --input-type=module <<'JS'
import assert from 'node:assert/strict';
let state;
for(let i=0;i<30;i++){
  try{const r=await fetch('http://127.0.0.1:3000/api/state');if(r.ok){state=await r.json();break;}}catch{}
  await new Promise(r=>setTimeout(r,100));
}
assert.equal(state?.pilots[0].name,'Container Persistence Test');
assert.equal((await fetch('http://127.0.0.1:3000/api/admin/state')).status,401);
console.log('Container OK: produção sem dados de demonstração, usuário sem root, raiz somente leitura, cookies Secure e persistência após reinício.');
JS
