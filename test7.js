var mapBounds;

var roadUpdateTimer = null;
var roadMaxD = 30;
var roadPos;

var roadRect = null;
var roadWt = null;
var roadHt = null;

function mapUpdate() {
    if (!map) return;

    // 현재 지도의 영역 좌표 가져오기
    mapBounds = map.getBounds();
    mapPPG();
    mapMH();
    mapMCR();
    mapHDH();
}

function openRoad(position) {
    cMode = "road";
    allNone();
    document.getElementById('roadBox').style.display = 'block';
    document.getElementById('BtnCloseRoad').style.display = 'block';

    roadView.relayout();// 지도의 크기를 변경하거나 숨김 상태에서 보인 직후에 호출

    // 특정 위치의 좌표와 가까운 로드뷰의 panoId를 추출하여 로드뷰를 띄운다.
    roadClient.getNearestPanoId(position, 50, function(panoId) {
        if (panoId === null) {
            alert('이 위치 주변에는 로드뷰를 지원하지 않습니다.');
            closeRoad();
            return;
        }
        roadView.setPanoId(panoId, position);
    });
}
function closeRoad() {
    cMode = "map";
    allNone();
    document.getElementById('map').style.display = 'block';
    document.getElementById('BtnSearch').style.display = 'block'; // 추가
    document.getElementById('BtnMyLoc').style.display = 'block';
    document.getElementById('BtnRoadMode').style.display = 'block';
    document.getElementById('BtnOpenCam').style.display = 'block';

    map.relayout();// 지도의 크기를 변경하거나 숨김 상태에서 보인 직후에 호출
}

function roadEvent() {
    if (cMode !== "road") return;
    if (roadSVG) roadSVG.replaceChildren();//줌, 회전시 선 안보임
    if (roadSVG) roadSVG.innerHTML = '';
    if (roadUpdateTimer) clearTimeout(roadUpdateTimer);
    // 50ms 이내 연달아 들어오는 이벤트 중 마지막 1회만 실행
    roadUpdateTimer = setTimeout(function() {roadUpdate();}, 50);
}

function roadUpdate() {
    if (cMode !== "road" || !roadView) return;

    roadRect = roadSVG.getBoundingClientRect();
    roadWt = roadRect.width;
    roadHt = roadRect.height;
    if (roadWt <= 0 || roadHt <= 0) return;
    roadSVG.setAttribute('width', roadWt);
    roadSVG.setAttribute('height', roadHt);
    roadSVG.setAttribute('viewBox', '0 0 ' + roadWt + ' ' + roadHt);

    // 로드뷰의 현재 위치 좌표 가져오기
    roadPos = roadView.getPosition();
    if (!roadPos) return;

    roadPPG();
    roadMH();
    roadMCR();
    roadHDH();
}

var camUpdateTimer = null;
var camStream = null;
var camGeoWatchId = null;// GPS watchPosition ID
var camPos;
var RAD = Math.PI / 180, DEG = 180 / Math.PI;
// 0 = 북쪽// 90 = 동쪽// 180 = 남쪽// 270 = 서쪽
var heading = null;// 카메라가 보는 방위
var camRot = null;// 그리기용 기기→지구 회전행렬 9개. null이면 아직 절대 방위 없음
var camRel = null;// 상대 orientation 행렬 (자이로 기반, 부드럽지만 방위 기준이 임의)
var relSeen = false;// 상대 orientation 이벤트를 받은 적 있는지 (없는 기기는 절대 이벤트로 대용)
var yawOffset = null;// 절대 방위 - 상대 방위 (°). 느린 필터로 추적
var cntRel = 0, cntAbs = 0;// 시험용: 이벤트 종류별 개수
var headingFix = parseFloat(localStorage.getItem("headingFix")) || 0;// 수동 방위 보정(°). 화면에서 실제 맨홀 탭하면 갱신. localStorage 저장
var drawn = [];// 마지막에 그린 마커 [{x, y, mh}] (탭 보정용)
var lastDraw = null;// 마지막 그리기 파라미터 {width, height, f, screenAngle}
var drawnRot = null, drawnPos = null;// 마지막으로 그렸을 때의 회전행렬·위치 (다시 그릴지 판단용)
var YAW_FILTER = 0.01;// 나침반 보정 속도. 작을수록 안 떨리지만 방위 오차 잡는 데 오래 걸림 (0.01 ≈ 2초)
var GPS_FILTER = 0.3;// GPS 위치 필터. 1이면 필터 없음. 작을수록 제자리 떨림 줄고 걸을 때 지연 큼
var REDRAW_ANGLE = 1;// 카메라 방향(방위+기울기)이 이만큼(°) 이상 바뀌어야 다시 그림. 1° ≈ 11px라 끊겨 보이면 0.3~0.5
var REDRAW_DIST = 1;// 내 위치가 이만큼(m) 이상 움직여야 다시 그림
var CAMERA_FOV = 69;// 카메라 화각(°, 영상 긴 변 기준). 보통 65~75. 마커 간격이 실제보다 좁거나 넓으면 조정
var CAMERA_HEIGHT = 1.5;// 카메라 높이(m). 맨홀은 지면이라 이만큼 아래에 그림
var MAG_DECLINATION = -8.7;// 자기 편각(°). 분당 2026년 약 -8.7(서편각)
var camDistance = 30;// 표시 범위(m)

//그리기 공통
var camWt = 0;
var camHt = 0;
var cosLat = 0;
var f;
var screenAngle = 0;

async function openCam() {
    if (!navigator.mediaDevices ||!navigator.mediaDevices.getUserMedia){
        alert("이 브라우저에서는 카메라를 사용할 수 없습니다.");
        return;
    }
    cMode = "cam";// 현재 모드
    allNone();// 기존 화면 숨기기
    document.getElementById("camBox").style.display = "block";
    document.getElementById("BtnCloseCam").style.display = "block";

    if (camSVG) camSVG.replaceChildren();// SVG 초기화

    // 시험용 인디케이터 행 + 보정 초기화 버튼 + 탭 보정 (index.html 수정 없이)
    if (!document.getElementById("indMe")) {
        document.getElementById("camIndicator").insertAdjacentHTML("beforeend",
            '<div>SRC : <span id="indSrc">-</span></div>' +
            '<div>ME : <span id="indMe">-</span></div>' +
            '<div>VIEW : <span id="indView">-</span></div>');
        document.getElementById("ui").insertAdjacentHTML("beforeend",
            '<button id="BtnFixReset" class="btn" onclick="resetFix()">보정 0</button>');
        document.getElementById("camBox").addEventListener("click", camTap);
    }
    document.getElementById("BtnFixReset").style.display = "block";

    // 이전 상태 초기화
    cmaPos = null;
    heading = null;
    camRot = null;
    camRel = null;
    relSeen = false;
    yawOffset = null;
    cntRel = 0; cntAbs = 0;
    drawn = []; lastDraw = null;

    // 방향 센서 시작 (카메라 await 전에. iOS 권한 요청은 버튼 클릭 직후여야 함. await 뒤면 사용자 제스처 소멸로 거부될 수 있음)
    // iPhone / iPad
    if (typeof DeviceOrientationEvent !== "undefined" &&
    typeof DeviceOrientationEvent.requestPermission === "function") {
        DeviceOrientationEvent.requestPermission()
        .then(function(permission) {
            if (permission === "granted") {
                window.addEventListener("deviceorientation",camEvent,true);
                console.log("iOS 방향 센서 시작");
            }
            else alert("방향 센서 권한 거부: " + permission);
        })
        .catch(function(error) {
            alert("방향 센서 권한 오류: " + error.message);
        });
    }
    // Android: 상대(자이로) + 절대(나침반) 둘 다 받음
    window.addEventListener("deviceorientationabsolute",camEvent,true);
    window.addEventListener("deviceorientation",camEvent,true);
    console.log("Android 방향 센서 시작");

    //stopCameraLocation();// 혹시 남아 있는 GPS watcher 제거
    if (camGeoWatchId !== null) {
        navigator.geolocation.clearWatch(camGeoWatchId);
        camGeoWatchId = null;
        console.log("GPS watch 종료:",camGeoWatchId);
    }

    try {// 카메라 시작
        camStream = await navigator.mediaDevices.getUserMedia({
            video: {facingMode: {ideal: "environment"}},
            audio: false
        });
        camView.srcObject = camStream;
        console.log("카메라 시작");
    }
    catch (error) {
        console.error("카메라 오류:",error);
        alert("카메라를 열 수 없습니다.\n" +error.message);
        closeCam();
        return;
    }

    // GPS 시작
    if (!navigator.geolocation) {
        alert("이 기기에서는 위치 정보를 사용할 수 없습니다.");
        return;
    }
    console.log("현재 위치 확인 중...");

    // 최초 위치
    navigator.geolocation.getCurrentPosition(
        function(position) {
            cmaPos = {
                lat:position.coords.latitude,
                lng:position.coords.longitude
            };

            console.log("최초 위치:",cmaPos.lat,cmaPos.lng);
            camUpdate();// 화면 표시
        },
        function(error) {
            console.error("GPS 오류:",error);
            if (error.code === 1) alert("위치 권한이 허용되지 않았습니다.");
            else if (error.code === 2) alert("현재 위치를 확인할 수 없습니다.");
            else if (error.code === 3) alert("위치 확인 시간이 초과되었습니다.");
        },
       {enableHighAccuracy: true,maximumAge: 3000,timeout: 10000}
    );
    // 위치 변화 감시
    camGeoWatchId =navigator.geolocation.watchPosition(
        function(position) {
            cmaPos = {
                lat:position.coords.latitude,
                lng:position.coords.longitude
            };
            camUpdate();
        },
        function(error) {
            console.log("GPS watch 오류:",error);
        },
        {enableHighAccuracy: true,maximumAge: 3000,timeout: 10000}
    );
    console.log("GPS watch 작동:",camGeoWatchId);
}

function closeCam() {
    cMode = "map";
    allNone();
    document.getElementById('map').style.display = 'block';
    document.getElementById('BtnSearch').style.display = 'block'; // 추가
    document.getElementById('BtnMyLoc').style.display = 'block';
    document.getElementById('BtnRoadMode').style.display = 'block';
    document.getElementById('BtnOpenCam').style.display = 'block';
    var btnFix = document.getElementById("BtnFixReset");
    if (btnFix) btnFix.style.display = "none";

    map.relayout();// 지도의 크기를 변경하거나 숨김 상태에서 보인 직후에 호출

    if (camStream) {
        camStream.getTracks().forEach(function(track) {
            track.stop();
        });
        camStream = null;
    }
    if (camView) camView.srcObject = null;

    //센서 이벤트 해제 (자원 절약)
    window.removeEventListener("deviceorientationabsolute",camEvent,true);
    window.removeEventListener("deviceorientation",camEvent,true);

    //stopCameraLocation();// GPS watcher 제거
    if (camGeoWatchId !== null) {
        navigator.geolocation.clearWatch(camGeoWatchId);
        console.log("GPS watch 종료:",camGeoWatchId);
        camGeoWatchId = null;
    }

    if (camUpdateTimer) {// 타이머 제거
        clearTimeout(camUpdateTimer);
        camUpdateTimer = null;
    }
}

// 센서 이벤트 처리.
// 그리기는 상대 orientation(자이로, 부드러움)으로 하고, 절대 방위(나침반, 떨림·기울기 오차)는 느린 필터로 yaw 보정에만 씀
function camEvent(event) {
    if (cMode !== "cam") return;
    if (event.alpha == null || event.beta == null || event.gamma == null) return;

    var R = rotMatrix(event.alpha, event.beta, event.gamma);
    var compass = event.webkitCompassHeading;// iOS: 이벤트 하나에 상대 alpha + 나침반 방위 같이 옴
    var isAbs = compass == null && event.absolute === true;// Android deviceorientationabsolute

    // 1. 상대 orientation 갱신. Android 절대 이벤트는 자이로 이벤트 없는 기기에서만 대용
    if (!isAbs) { camRel = R; relSeen = true; cntRel++; }
    else { cntAbs++; if (!relSeen) camRel = R; }
    if (!camRel) return;

    // 2. 절대 방위 기준으로 yaw 오프셋(절대 - 상대) 느린 필터.
    //    카메라가 거의 수직으로 아래 볼 때(수평 성분 < 0.3)나 위를 볼 때는 나침반 방위 불안정하니 건너뜀
    var ref = compass != null ? compass : (isAbs ? headingOf(R) : null);
    if (ref != null && Math.hypot(camRel[2], camRel[5]) > 0.3 && camRel[8] > -0.1) {
        var sample = wrap180(ref - headingOf(camRel));
        if (yawOffset == null) yawOffset = sample;
        else yawOffset = wrap180(yawOffset + wrap180(sample - yawOffset) * YAW_FILTER);
    }

    // 센서값 표시 (시험용)
    document.getElementById("indAlpha").textContent = event.alpha.toFixed(2);
    document.getElementById("indBeta").textContent = event.beta.toFixed(2);
    document.getElementById("indGamma").textContent = event.gamma.toFixed(2);
    document.getElementById("indAbsolute").textContent = event.absolute + (compass != null ? " / compass " + compass.toFixed(1) : "");
    document.getElementById("indSrc").textContent = "rel " + cntRel + " / abs " + cntAbs +
        " / offset " + (yawOffset == null ? "-" : yawOffset.toFixed(1)) + " / fix " + headingFix.toFixed(1);
    if (yawOffset == null) return;// 아직 절대 기준 없음

    // 3. 그리기용 행렬 = 상대 행렬을 (yaw 오프셋 + 자기 편각 + 수동 보정)만큼 돌림
    camRot = camRel.slice();
    rotateYaw(camRot, -(yawOffset + MAG_DECLINATION + headingFix));
    heading = headingOf(camRot);
    document.getElementById("indHeading").textContent = heading.toFixed(2);

    camUpdate();
}

// 다시 그릴지 결정하는 공통 입구. 센서(camEvent)와 GPS(getCurrentPosition/watchPosition) 모두 여기로 들어옴.
// 마지막으로 그린 뒤 카메라 방향이 REDRAW_ANGLE 이상 돌았거나 위치가 REDRAW_DIST 이상 움직였을 때만 그림 (손떨림·GPS 떨림 억제)
function camUpdate() {
    if (cMode !== "cam" || !cmaPos) return;
    document.getElementById("indMe").textContent =
        cmaPos.lat.toFixed(6) + ", " + cmaPos.lng.toFixed(6);// + " (±" + Math.round(cmaPos.acc) + "m)";
    if (!camRot) {
        document.getElementById("indView").textContent = "센서 없음 (절대 방위 이벤트 안 옴)";
        return;
    }
    if (drawnRot && drawnPos) {
        var moved = Math.hypot((cmaPos.lng - drawnPos.lng) * 111320 * Math.cos(cmaPos.lat * RAD),
            (cmaPos.lat - drawnPos.lat) * 111320);
        if (rotAngle(drawnRot, camRot) < REDRAW_ANGLE && moved < REDRAW_DIST) return;
    }
    if (camUpdateTimer) return;// 이미 예약됨
    camUpdateTimer = requestAnimationFrame(function() {
        camUpdateTimer = null;
        drawCam();
    });
}

// 카메라 화면에 맨홀 오버레이 그리기. camUpdate가 필요할 때만 호출
function drawCam() {
    if (cMode !== "cam" || !cmaPos || !camRot) return;

    var container = document.getElementById("camBox");
    camWt = container.clientWidth;
    camHt = container.clientHeight;

    // 1. SVG 컨테이너 초기화
    if (!camSVG) camSVG = document.getElementById('camSVG');
    camSVG.setAttribute("width", camWt);
    camSVG.setAttribute("height", camHt);
    // 시험용: 중앙 십자선
    camSVG.innerHTML = '<line x1="' + camWt / 2 + '" y1="0" x2="' + camWt / 2 + '" y2="' + camHt + '" stroke="#0f0" opacity="0.6"/>' +
        '<line x1="0" y1="' + camHt / 2 + '" x2="' + camWt + '" y2="' + camHt / 2 + '" stroke="#0f0" opacity="0.6"/>';

    // 2. 초점거리(px): 영상 긴 변 화각 기준, object-fit:cover 확대율 반영
    var vw = camView.videoWidth || camWt, vh = camView.videoHeight || camHt;
    f = Math.max(camWt / vw, camHt / vh) * Math.max(vw, vh) / 2 / Math.tan(CAMERA_FOV / 2 * RAD);
    screenAngle = (screen.orientation ? screen.orientation.angle : window.orientation) || 0;// 가로모드 회전
    cosLat = Math.cos(cmaPos.lat * RAD);
    drawn = [];
    lastDraw = {camWt: camWt, camHt: camHt, f: f, screenAngle: screenAngle};
    drawnRot = camRot.slice();
    drawnPos = {lat: cmaPos.lat, lng: cmaPos.lng};
    document.getElementById("indView").textContent =
        "보이는 범위 ±" + (Math.atan(camWt / 2 / f) * DEG).toFixed(0) + "°, 화면회전 " + screenAngle;

    camPPG();
    camMH();
    camMCR();
    camHDH();
}


// 화면에서 실제 맨홀 위치를 탭 → 가장 가까운 마커가 그 자리에 오도록 수동 방위 보정
function camTap(ev) {
    if (cMode !== "cam" || !camRot || !cmaPos || !lastDraw || !drawn.length) return;
    var d = lastDraw;
    var rect = document.getElementById("camBox").getBoundingClientRect();
    var tx = ev.clientX - rect.left, ty = ev.clientY - rect.top;

    var best = drawn[0];
    drawn.forEach(function(m) {
        if (Math.hypot(m.x - tx, m.y - ty) < Math.hypot(best.x - tx, best.y - ty)) best = m;
    });

    // 탭 지점 광선의 방위(현재 추정 기준) vs 그 마커의 실제 방위 → 차이만큼 보정
    var tapHead = rayHeading(camRot, tx, ty, d.camWt, d.camHt, d.f, d.screenAngle);
    var cosLat = Math.cos(cmaPos.lat * RAD);
    var east = (best.mh.position.getLng() - cmaPos.lng) * 111320 * cosLat;
    var north = (best.mh.position.getLat() - cmaPos.lat) * 111320;
    var brg = (Math.atan2(east, north) * DEG + 360) % 360;
    headingFix = wrap180(headingFix + wrap180(brg - tapHead));
    localStorage.setItem("headingFix", headingFix);
}

function resetFix() {
    headingFix = 0;
    localStorage.removeItem("headingFix");
}


// 각도를 -180~180 범위로
function wrap180(a) {
    return ((a + 540) % 360) - 180;
}

// 두 회전행렬 사이 각도(°). 방위·기울기·좌우 기울임 어느 축 변화든 포함
function rotAngle(A, B) {
    var t = 0;
    for (var i = 0; i < 9; i++) t += A[i] * B[i];// trace(Aᵀ·B)
    return Math.acos(Math.max(-1, Math.min(1, (t - 1) / 2))) * DEG;
}

// 기기→지구 회전행렬 (W3C DeviceOrientation ZXY). 열 = 기기 축(x오른쪽,y위,z화면밖)의 지구좌표(동,북,상)
function rotMatrix(alpha, beta, gamma) {
    var cA = Math.cos(alpha * RAD), sA = Math.sin(alpha * RAD);
    var cB = Math.cos(beta * RAD), sB = Math.sin(beta * RAD);
    var cG = Math.cos(gamma * RAD), sG = Math.sin(gamma * RAD);
    return [
        cA * cG - sA * sB * sG, -cB * sA, cA * sG + cG * sA * sB,
        cG * sA + cA * sB * sG,  cA * cB, sA * sG - cA * cG * sB,
        -cB * sG,                sB,      cB * cG
    ];
}

// 카메라(-z)가 보는 방위 (0=북, 90=동)
function headingOf(R) {
    return (Math.atan2(-R[2], -R[5]) * DEG + 360) % 360;
}

// 지구 상(z)축 기준으로 theta(°)만큼 회전. 방위가 theta만큼 줄어듦
function rotateYaw(R, theta) {
    var c = Math.cos(theta * RAD), s = Math.sin(theta * RAD);
    for (var i = 0; i < 3; i++) {
        var r0 = R[i], r1 = R[3 + i];
        R[i] = c * r0 - s * r1;
        R[3 + i] = s * r0 + c * r1;
    }
}

// 지구좌표 오프셋(동,북,상 m) → 화면 px. 카메라 뒤쪽·화면 밖이면 null
function camProject(R, east, north, up, width, height, f, screenAngle) {
    // 지구→기기 (R 전치). 기기 축: x=오른쪽, y=위, z=화면 밖 (카메라는 -z 방향)
    var dx = R[0] * east + R[3] * north + R[6] * up;
    var dy = R[1] * east + R[4] * north + R[7] * up;
    var fwd = -(R[2] * east + R[5] * north + R[8] * up);
    if (fwd <= 0) return null;
    // 화면 회전(가로모드) 반영 후 핀홀 투영
    var c = Math.cos(screenAngle * RAD), s = Math.sin(screenAngle * RAD);
    var x = width / 2 + f * (c * dx - s * dy) / fwd;
    var y = height / 2 - f * (s * dx + c * dy) / fwd;
    if (x < -50 || x > width + 50 || y < -50 || y > height + 50) return null;
    return {x: x, y: y};
}

// 화면 px → 그 방향 광선의 방위 (camProject 역변환, 방위만)
function rayHeading(R, x, y, width, height, f, screenAngle) {
    var xs = (x - width / 2) / f, ys = -(y - height / 2) / f;
    var c = Math.cos(screenAngle * RAD), s = Math.sin(screenAngle * RAD);
    var dx = c * xs + s * ys, dy = -s * xs + c * ys;// 화면 회전 되돌림
    // 기기 벡터 (dx, dy, -1) → 지구
    var e = R[0] * dx + R[1] * dy - R[2];
    var n = R[3] * dx + R[4] * dy - R[5];
    return (Math.atan2(e, n) * DEG + 360) % 360;
}

// 두 위경도 좌표 간의 방위각(0~360도)을 구하는 함수
function getBearing(lat1, lng1, lat2, lng2) {
    var RAD = Math.PI / 180;
    var y = Math.sin((lng2 - lng1) * RAD) * Math.cos(lat2 * RAD);
    var x = Math.cos(lat1 * RAD) * Math.sin(lat2 * RAD) -
            Math.sin(lat1 * RAD) * Math.cos(lat2 * RAD) * Math.cos((lng2 - lng1) * RAD);
    var brng = Math.atan2(y, x) * (180 / Math.PI);
    return (brng + 360) % 360;
}
// 각도 정규화
function normalizeAngle(angle) {
    angle = angle % 360;
    if (angle < 0) angle += 360;
    return angle;
}
// 점 P(lat, lng)에서 선분 AB(aLat, aLng ~ bLat, bLng)까지의 최단 좌표 H 구하기
function getClosestPointOnLine(pLat, pLng, aLat, aLng, bLat, bLng) {
    var dx = bLng - aLng;
    var dy = bLat - aLat;

    // A와 B가 동일한 점인 경우
    if (dx === 0 && dy === 0) return { lat: aLat, lng: aLng };

    // 선분 AB 상에서 P의 투영 위치 비율 t 계산
    var t = ((pLng - aLng) * dx + (pLat - aLat) * dy) / (dx * dx + dy * dy);

    // t 범위에 따른 최단점 선택
    if (t <= 0) return { lat: aLat, lng: aLng };
    if (t >= 1) return { lat: bLat, lng: bLng };

    return {lat: aLat + t * dy, lng: aLng + t * dx};
}
// 두 좌표 간의 직선 거리(m) 계산 함수 (Haversine Formula)
function getDistanceMeter(lat1, lng1, lat2, lng2) {
    var R = 6371000; // 지구 반지름 (m)
    var dLat = (lat2 - lat1) * Math.PI / 180;
    var dLng = (lng2 - lng1) * Math.PI / 180;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// 두 지점 사이의 비율 좌표 구하기
function getPointAtRatio(pos1, pos2, ratio) {
    var lat1 = pos1.getLat();
    var lng1 = pos1.getLng();

    var lat2 = pos2.getLat();
    var lng2 = pos2.getLng();

    var lat = lat1 + (lat2 - lat1) * ratio;
    var lng = lng1 + (lng2 - lng1) * ratio;

    return new kakao.maps.LatLng(lat, lng);
}