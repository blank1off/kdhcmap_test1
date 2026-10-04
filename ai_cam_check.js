// 실행: node ai_cam_check.js  — rotMatrix / headingOf / rotateYaw / camProject 자가 검사
var fs = require("fs"), vm = require("vm"), assert = require("assert");
vm.runInThisContext(fs.readFileSync(__dirname + "/ai_test.js", "utf8"));

var W = 400, H = 800, F = 500;
function near(a, b) { assert(Math.abs(a - b) < 1e-6, a + " != " + b); }

// 폰 세워서(beta=90) 북쪽 봄: 10m 앞 맨홀 → 가로 중앙, 1.5m 아래 = F*1.5/10 px 아래
var R = rotMatrix(0, 90, 0);
near(headingOf(R), 0);
var p = camProject(R, 0, 10, -1.5, W, H, F, 0);
near(p.x, W / 2); near(p.y, H / 2 + F * 1.5 / 10);
// 오른쪽(동쪽) 5m 옆 맨홀 → 화면 오른쪽. 뒤쪽(남쪽) → null
assert(camProject(R, 5, 10, -1.5, W, H, F, 0).x > W / 2);
assert.strictEqual(camProject(R, 0, -10, -1.5, W, H, F, 0), null);

// 동쪽 봄(alpha=270): 방위 90, 북동쪽(동10 북3) 맨홀은 화면 왼쪽
R = rotMatrix(270, 90, 0);
near(headingOf(R), 90);
assert(camProject(R, 10, 3, -1.5, W, H, F, 0).x < W / 2);

// 45° 숙여 봄(beta=45, 북쪽): 1.5m 앞·1.5m 아래 맨홀 = 화면 정중앙
R = rotMatrix(0, 45, 0);
p = camProject(R, 0, 1.5, -1.5, W, H, F, 0);
near(p.x, W / 2); near(p.y, H / 2);

// iOS 보정: 행렬은 북쪽인데 나침반이 90(동쪽)이면 동쪽으로 맞춤
R = rotMatrix(0, 90, 0);
rotateYaw(R, headingOf(R) - 90);
near(headingOf(R), 90);

// 가로모드(반시계 90°; alpha=90,beta=0,gamma=-90 = 북쪽 보며 왼쪽으로 눕힘): 동쪽 맨홀은 오른쪽, 지면은 아래
p = camProject(rotMatrix(90, 0, -90), 5, 10, -1.5, W, H, F, 90);
assert(p.x > W / 2 && p.y > H / 2);

console.log("ok");
