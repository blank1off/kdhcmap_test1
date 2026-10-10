// 실행: node ai_line_check.js  — ai_line.js의 camSpaceOf/camPx/clipNear 자가 검사 (test7.js의 camProject와 대조)
var fs = require("fs"), vm = require("vm"), assert = require("assert");
globalThis.localStorage = {getItem: function() { return null; }, setItem: function() {}, removeItem: function() {}};// 브라우저 전용 API 대역
vm.runInThisContext(fs.readFileSync(__dirname + "/test7.js", "utf8"));
vm.runInThisContext(fs.readFileSync(__dirname + "/ai_line.js", "utf8"));

function near(a, b) { assert(Math.abs(a - b) < 1e-6, a + " != " + b); }
function LatLng(lat, lng) { return {getLat: function() { return lat; }, getLng: function() { return lng; }}; }

// 전역 세팅: 적도 근처(cosLat=1), 폰 세워 북쪽 봄
cmaPos = {lat: 0, lng: 0};
cosLat = 1; camWt = 400; camHt = 800; f = 500; screenAngle = 0;
camRot = rotMatrix(0, 90, 0);

// 1. camSpaceOf + camPx == camProject (앞쪽·화면 안 점)
var pos = LatLng(10 / 111320, 2 / 111320);// 북 10m, 동 2m
var c = camSpaceOf(pos);
var p = camPx(c);
var q = camProject(camRot, 2, 10, -CAMERA_HEIGHT, camWt, camHt, f, screenAngle);
near(p.x, q.x); near(p.y, q.y);
near(c.fwd, 10);

// 2. 뒤쪽 점은 fwd < 0, clipNear로 CAM_NEAR 면 위 점이 됨 (선분 위 선형 보간)
var a = camSpaceOf(LatLng(-5 / 111320, 0));// 남 5m (뒤)
var b = c;
assert(a.fwd < 0);
var k = clipNear(a, b);
near(k.fwd, CAM_NEAR);
var t = (CAM_NEAR - a.fwd) / (b.fwd - a.fwd);
near(k.dx, a.dx + (b.dx - a.dx) * t);
near(k.dy, a.dy + (b.dy - a.dy) * t);
assert(t > 0 && t < 1);

// 3. 잘린 점은 화면 아래쪽 멀리(큰 y)로 투영됨. 카메라 높이 1.5m, fwd 0.3m → 수직으로 크게 아래
var kp = camPx(k);
assert(kp.y > camHt, "clip point y=" + kp.y);

// 4. camInner 경계
assert(camInner(0, 0) && camInner(camWt, camHt) && !camInner(-2, 0) && !camInner(0, camHt + 2));

console.log("ok");
