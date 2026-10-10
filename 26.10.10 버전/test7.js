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
    mapETC();
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

    // 2. 지도 화면을 현재 위치로 이동 및 Zoom 레벨 최대로 설정
    if (roadPos) { // 또는 현재 GPS 위치 변수 (cmaPos 등)
        map.setCenter(roadPos); 
        map.setLevel(1); // 레벨 1(최대 확대)로 부드럽게 이동
    }
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
    roadETC();
}

var camUpdateTimer = null;
var camStream = null;
var camGeoWatchId = null;// GPS watchPosition ID
var cmaPos = null;// 카메라 모드 현재 위치 {lat, lng}
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
var gpsRaw = null;// 마지막 GPS 원값 {lat, lng}. 보정 버튼 누르면 여기에 posFix 다시 적용
var posFix = {east: 0, north: 0};// GPS 위치 수동 보정(m). AR 화면 방향 버튼으로 1m씩. 세션 동안만 유지
var yawN = 0;// yaw 오프셋 샘플 수. 초반엔 단순 평균(빠른 수렴), 100개 넘으면 YAW_FILTER
var GPS_MAX_ACC = 20;// GPS 정확도(m)가 이보다 나쁘고 지금 값보다도 나쁘면 무시. 정확도가 늘 이보다 나쁜 곳이면 올릴 것
var YAW_FILTER = 0.01;// 나침반 보정 속도. 작을수록 안 떨리지만 방위 오차 잡는 데 오래 걸림 (0.01 ≈ 2초)
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
            '<div>GPS : <span id="indGps">-</span></div>' +
            '<div>ME : <span id="indMe">-</span></div>' +
            '<div>VIEW : <span id="indView">-</span></div>');
        document.getElementById("camBox").addEventListener("click", camTap);
        // 보정 패드: 4방향 = 내 위치 1m 이동, 중앙 = 방위+위치 보정 초기화. 하단 중앙 (camBox 밖에 둬야 탭이 camTap으로 안 감)
        document.getElementById("box1").insertAdjacentHTML("beforeend",
            '<div id="camPad" style="position:fixed; left:50%; bottom:10px; transform:translateX(-50%); z-index:999; display:none; grid-template-columns:repeat(3,40px); grid-template-rows:repeat(3,40px); gap:6px;">' +
            '<span></span><button class="icon-btn" onclick="nudgePos(0,1)" title="내 위치 북쪽 1m">▲</button><span></span>' +
            '<button class="icon-btn" onclick="nudgePos(-1,0)" title="내 위치 서쪽 1m">◀</button>' +
            '<button class="icon-btn" onclick="resetAll()" title="보정 초기화 (방위+위치)" style="font-size:12px;">0</button>' +
            '<button class="icon-btn" onclick="nudgePos(1,0)" title="내 위치 동쪽 1m">▶</button>' +
            '<span></span><button class="icon-btn" onclick="nudgePos(0,-1)" title="내 위치 남쪽 1m">▼</button><span></span>' +
            '</div>');
    }
    document.getElementById("camPad").style.display = "grid";
    document.getElementById("camIndicator").style.bottom = "150px";// 패드(132px) 위로

    // 이전 상태 초기화
    cmaPos = null;
    gpsRaw = null;
    heading = null;
    camRot = null;
    camRel = null;
    relSeen = false;
    yawOffset = null;
    cntRel = 0; cntAbs = 0; yawN = 0;
    drawn = []; lastDraw = null;
    drawnRot = null; drawnPos = null;// 다시 열 때 1°/1m 문턱이 이전 상태와 비교되지 않게

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
            setGps(position.coords.latitude, position.coords.longitude, position.coords.accuracy);
            console.log("최초 위치:",cmaPos.lat,cmaPos.lng);
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
            setGps(position.coords.latitude, position.coords.longitude, position.coords.accuracy);
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
    var pad = document.getElementById("camPad");
    if (pad) pad.style.display = "none";
    document.getElementById("camIndicator").style.bottom = "10px";

    map.relayout();// 지도의 크기를 변경하거나 숨김 상태에서 보인 직후에 호출

    // 2. 지도 화면을 현재 위치로 이동 및 Zoom 레벨 최대로 설정
    if (cmaPos) {
        var currentLatLng = new kakao.maps.LatLng(cmaPos.lat, cmaPos.lng);
        map.setCenter(currentLatLng);
        map.setLevel(1);
    }

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
        cancelAnimationFrame(camUpdateTimer);// requestAnimationFrame id
        camUpdateTimer = null;
    }
}

// ───────────────────────── 카메라 AR 좌표계 약속 ─────────────────────────
//  지구 좌표: x=동(east), y=북(north), z=위(up). 단위 m. 원점 = 내 위치(cmaPos). 맨홀 등 지면 객체는 z = -CAMERA_HEIGHT
//  기기 좌표: x=화면 오른쪽, y=화면 위(폰 상단), z=화면 밖(나를 향함). 뒷카메라는 -z 방향을 봄
//  회전행렬 R: 숫자 9개, 행 우선 [r0 r1 r2 / r3 r4 r5 / r6 r7 r8]. 기기 벡터 → 지구 벡터
//             열 = 기기 축을 지구 좌표로 쓴 것. 1열(r0,r3,r6)=기기 x축, 2열(r1,r4,r7)=기기 y축, 3열(r2,r5,r8)=기기 z축
//             지구 → 기기는 R의 전치(행과 열 바꿈)
//  방위(heading): 0=북, 90=동, 180=남, 270=서. 시계방향. 단위 °
//  흐름: 센서(camEvent) → camRel(상대 자세) → yaw 보정 → camRot(진북 기준 자세) → camUpdate(문턱 판단) → drawCam → camProject(점 → 화면 px)
// ──────────────────────────────────────────────────────────────────────────

// 센서 이벤트 처리.
// 그리기는 상대 orientation(자이로, 부드러움)으로 하고, 절대 방위(나침반, 떨림·기울기 오차)는 느린 필터로 yaw 보정에만 씀
function camEvent(event) {
    if (cMode !== "cam") return;// 카메라 모드 아닐 때 무시
    if (event.alpha == null || event.beta == null || event.gamma == null) return;// 센서값 없는 이벤트(데스크톱 등) 무시

    var R = rotMatrix(event.alpha, event.beta, event.gamma);// 이 이벤트의 기기 자세 → 회전행렬
    var compass = event.webkitCompassHeading;// iOS 전용: 나침반 방위(자북 기준). 안드로이드는 undefined
    var isAbs = compass == null && event.absolute === true;// 안드로이드 절대 이벤트(deviceorientationabsolute, 자력계 포함)인지

    // 1. 상대 orientation(camRel) 갱신
    //    상대 이벤트 = 자이로 기반. 부드럽고 떨림 없지만 방위 기준이 임의(켤 때마다 다름)
    //    절대 이벤트 = 자력계 포함. 방위는 맞지만 떨리고 기울이면 오차 큼
    if (!isAbs) {
        // 절대 이벤트로 임시 운용하다 상대 이벤트가 처음 오면 기준 프레임이 바뀜 → 오프셋 다시 시작
        // (안 하면 오프셋이 0으로 굳고 1%씩만 따라가서 몇 초 동안 마커가 옆으로 흐름)
        if (!relSeen) { yawOffset = null; yawN = 0; }
        camRel = R;// 그리기에 쓸 자세는 항상 상대 이벤트 것
        relSeen = true;
        cntRel++;// 표시용 카운터
    }
    else {
        cntAbs++;// 표시용 카운터
        if (!relSeen) camRel = R;// 자이로 없는 폰: 상대 이벤트가 안 오므로 절대 이벤트로 대용
    }
    if (!camRel) return;

    // 2. yaw 오프셋 = (절대 방위) - (상대 행렬의 방위). 상대 프레임을 진북에 맞추는 회전량
    var ref = compass != null ? compass : (isAbs ? headingOf(R) : null);// 절대 방위 샘플. iOS=나침반값, 안드로이드=절대 행렬의 방위, 상대 이벤트=없음
    //    camRel[2], camRel[5] = 기기 z축의 동/북 성분. 그 크기 = 카메라 시선의 수평 성분 (0.3 미만 = 거의 수직 아래)
    //    camRel[8] = 기기 z축의 위 성분. z는 시선의 반대라 음수면 카메라가 위를 봄. 둘 다 방위가 불안정하니 샘플 건너뜀
    if (ref != null && Math.hypot(camRel[2], camRel[5]) > 0.3 && camRel[8] > -0.1) {
        var sample = wrap180(ref - headingOf(camRel));// 이번 샘플의 오프셋 (-180~180)
        yawN++;
        var k = Math.max(YAW_FILTER, 1 / yawN);// 필터 계수: 1번째 1.0, 2번째 0.5 … = 초반엔 단순 평균(빠른 수렴), 100번째부터 YAW_FILTER(느린 추적)
        if (yawOffset == null) yawOffset = sample;
        else yawOffset = wrap180(yawOffset + wrap180(sample - yawOffset) * k);// 지수 평활. 각도라 차이도 wrap
    }

    // 센서값 표시 (시험용)
    document.getElementById("indAlpha").textContent = event.alpha.toFixed(2);
    document.getElementById("indBeta").textContent = event.beta.toFixed(2);
    document.getElementById("indGamma").textContent = event.gamma.toFixed(2);
    document.getElementById("indAbsolute").textContent = event.absolute + (compass != null ? " / compass " + compass.toFixed(1) : "");
    document.getElementById("indSrc").textContent = "rel " + cntRel + " / abs " + cntAbs +
        " / offset " + (yawOffset == null ? "-" : yawOffset.toFixed(1)) + " / fix " + headingFix.toFixed(1);
    if (yawOffset == null) return;// 아직 절대 기준 없음 → 못 그림

    // 3. 그리기용 행렬 camRot = 상대 행렬을 지구 z축 기준으로 (yaw 오프셋 + 자기 편각 + 수동 보정)만큼 돌린 것
    camRot = camRel.slice();// 복사 (camRel은 보존)
    rotateYaw(camRot, -(yawOffset + MAG_DECLINATION + headingFix));// rotateYaw는 방위를 theta만큼 "줄이므로" 더하려면 음수
    heading = headingOf(camRot);// 카메라가 보는 진북 기준 방위
    document.getElementById("indHeading").textContent = heading.toFixed(2);

    camUpdate();// 다시 그릴지 판단
}

// 다시 그릴지 결정하는 공통 입구. 센서(camEvent)와 GPS(setGps), 보정 버튼 모두 여기로 들어옴.
// 마지막으로 그린 뒤 카메라 방향이 REDRAW_ANGLE 이상 돌았거나 위치가 REDRAW_DIST 이상 움직였을 때만 그림 (손떨림·GPS 떨림 억제)
function camUpdate() {
    if (cMode !== "cam" || !cmaPos) return;// 위치 없으면 아무것도 못 함
    document.getElementById("indGps").textContent =
        gpsRaw.lat.toFixed(6) + ", " + gpsRaw.lng.toFixed(6) + " ±" + Math.round(gpsRaw.acc) + "m";// GPS 원값. ±는 정확도 반경(m)
    document.getElementById("indMe").textContent =
        cmaPos.lat.toFixed(6) + ", " + cmaPos.lng.toFixed(6) +
        " (보정 동 " + posFix.east + "m, 북 " + posFix.north + "m)";// 패드로 보정한 뒤 위치 = 실제 계산에 쓰는 값
    if (!camRot) {
        document.getElementById("indView").textContent = "센서 없음 (절대 방위 이벤트 안 옴)";
        return;
    }
    if (drawnRot && drawnPos) {// 한 번이라도 그린 뒤라면 변화량 검사
        var moved = Math.hypot((cmaPos.lng - drawnPos.lng) * 111320 * Math.cos(cmaPos.lat * RAD),// 동서 이동 m (경도 1° = 111320·cos(위도) m)
            (cmaPos.lat - drawnPos.lat) * 111320);// 남북 이동 m (위도 1° ≈ 111320 m)
        if (rotAngle(drawnRot, camRot) < REDRAW_ANGLE && moved < REDRAW_DIST) return;// 둘 다 문턱 아래면 안 그림
    }
    if (camUpdateTimer) return;// 이미 예약됨
    camUpdateTimer = requestAnimationFrame(function() {// 다음 화면 프레임에 1번만 그림 (이벤트 60Hz+ 몰려도 합쳐짐)
        camUpdateTimer = null;
        drawCam();
    });
}

// 카메라 화면 그리기. camUpdate가 필요할 때만 호출. 투영에 쓰는 공통값(camWt, camHt, f, screenAngle, cosLat) 여기서 갱신
function drawCam() {
    if (cMode !== "cam" || !cmaPos || !camRot) return;

    var container = document.getElementById("camBox");
    camWt = container.clientWidth;// 화면 너비 px
    camHt = container.clientHeight;// 화면 높이 px

    // 1. SVG 컨테이너 초기화
    if (!camSVG) camSVG = document.getElementById('camSVG');
    camSVG.setAttribute("width", camWt);// SVG 좌표 = 화면 px 1:1
    camSVG.setAttribute("height", camHt);
    // 시험용: 중앙 십자선 (세로선 = 카메라 방위, 가로선 = 수평선 높이. 폰 똑바로 세우면 지면 객체는 가로선 아래)
    camSVG.innerHTML = '<line x1="' + camWt / 2 + '" y1="0" x2="' + camWt / 2 + '" y2="' + camHt + '" stroke="#0f0" opacity="0.6"/>' +
        '<line x1="0" y1="' + camHt / 2 + '" x2="' + camWt + '" y2="' + camHt / 2 + '" stroke="#0f0" opacity="0.6"/>';

    // 2. 초점거리 f(px): "1m 앞의 1m 옆이 화면에서 몇 px인가". 핀홀 카메라 공식 x = f · (옆/앞)
    //    영상 긴 변 전체가 CAMERA_FOV°를 담는다 치면 영상 px 기준 f = (긴 변/2) / tan(FOV/2)
    //    object-fit:cover는 영상을 max(화면너비/영상너비, 화면높이/영상높이)배로 키우니 그 배율을 곱해 화면 px로
    var vw = camView.videoWidth || camWt, vh = camView.videoHeight || camHt;// 영상 원본 크기. 아직 모르면 화면 크기로 대용
    f = Math.max(camWt / vw, camHt / vh) * Math.max(vw, vh) / 2 / Math.tan(CAMERA_FOV / 2 * RAD);
    screenAngle = (screen.orientation ? screen.orientation.angle : window.orientation) || 0;// 화면 회전(0/90/180/270). 가로모드면 기기 x/y축이 화면 x/y축과 어긋남
    cosLat = Math.cos(cmaPos.lat * RAD);// 경도 1°의 m 길이 보정 계수 (위도 높을수록 짧음)
    drawn = [];// 탭 보정용 마커 목록 초기화 (camMH가 채움)
    lastDraw = {camWt: camWt, camHt: camHt, f: f, screenAngle: screenAngle};// 탭 보정 때 쓸 투영 파라미터
    drawnRot = camRot.slice();// 이번에 그린 자세·위치 기억 → camUpdate 문턱 비교용
    drawnPos = {lat: cmaPos.lat, lng: cmaPos.lng};
    document.getElementById("indView").textContent =
        "보이는 범위 ±" + (Math.atan(camWt / 2 / f) * DEG).toFixed(0) + "°, 화면회전 " + screenAngle;// 화면 가로 반폭이 몇 °인지

    camPPG();// 배관 (ai_line.js)
    camMH();// 맨홀 (point.js)
    camMCR();// 기계실
    camHDH();// 핸드홀
    camETC();// 기타
}


// 화면에서 실제 맨홀 위치를 탭 → 가장 가까운 마커가 그 자리에 오도록 수동 방위 보정(headingFix)
function camTap(ev) {
    if (cMode !== "cam" || !camRot || !cmaPos || !lastDraw || !drawn.length) return;// 그려진 마커 없으면 기준 없음
    var d = lastDraw;// 마지막 그리기의 투영 파라미터
    var rect = document.getElementById("camBox").getBoundingClientRect();
    var tx = ev.clientX - rect.left, ty = ev.clientY - rect.top;// 탭 위치 → camBox 기준 px

    var best = drawn[0];// 탭 지점에서 화면상 가장 가까운 마커 찾기
    drawn.forEach(function(m) {
        if (Math.hypot(m.x - tx, m.y - ty) < Math.hypot(best.x - tx, best.y - ty)) best = m;
    });

    // 탭 지점 광선의 방위(현재 추정 기준) vs 그 마커의 실제 방위 → 차이만큼 보정
    var tapHead = rayHeading(camRot, tx, ty, d.camWt, d.camHt, d.f, d.screenAngle);// "탭한 곳이 가리키는 방위"를 지금 자세로 역산
    var cosLat = Math.cos(cmaPos.lat * RAD);
    var east = (best.mh.position.getLng() - cmaPos.lng) * 111320 * cosLat;// 마커까지 동쪽 거리 m
    var north = (best.mh.position.getLat() - cmaPos.lat) * 111320;// 마커까지 북쪽 거리 m
    var brg = (Math.atan2(east, north) * DEG + 360) % 360;// 마커의 실제 방위 (GPS·CSV 기준)
    headingFix = wrap180(headingFix + wrap180(brg - tapHead));// 실제 방위 - 추정 방위 만큼 누적 보정
    localStorage.setItem("headingFix", headingFix);// 나침반 편차는 기기 고유라 저장
}

// GPS 원값 저장 후 수동 보정(posFix) 적용. 센서와 같은 입구(camUpdate)로
function setGps(lat, lng, acc) {
    // acc = 정확도 반경 m (그 안에 있을 확률 약 68%). 첫 위치는 Wi-Fi/기지국 기반 거친 값이 먼저 오고 위성 잡히면 좋아짐
    // 문턱보다 나쁘고 지금 값보다도 나쁜 위치는 버림. 첫 값은 화면이라도 띄우려고 받음
    if (gpsRaw && acc > GPS_MAX_ACC && acc > gpsRaw.acc) return;
    gpsRaw = {lat: lat, lng: lng, acc: acc};// 원값 보관 (보정 버튼 누르면 여기에 다시 posFix 적용)
    applyPosFix();
    camUpdate();
}

// cmaPos = GPS 원값 + posFix(m). 위도 1° ≈ 111320 m, 경도 1° = 111320·cos(위도) m
function applyPosFix() {
    if (!gpsRaw) return;
    cmaPos = {
        lat: gpsRaw.lat + posFix.north / 111320,// 북쪽 m → 위도 °
        lng: gpsRaw.lng + posFix.east / (111320 * Math.cos(gpsRaw.lat * RAD))// 동쪽 m → 경도 °
    };
}

// 방향 버튼: 내 위치를 동(+east)/북(+north) m만큼 이동. 1m는 문턱(REDRAW_DIST)에 걸릴 수 있어 강제로 다시 그림
function nudgePos(east, north) {
    posFix.east += east;
    posFix.north += north;
    applyPosFix();
    drawnPos = null;// 문턱 검사 건너뛰게
    camUpdate();
}

function resetPos() {
    posFix = {east: 0, north: 0};
    applyPosFix();
    drawnPos = null;
    camUpdate();
}

// 패드 중앙 버튼: 방위 보정(headingFix) + 위치 보정(posFix) 모두 초기화
function resetAll() {
    resetFix();
    resetPos();
}

function resetFix() {
    headingFix = 0;
    localStorage.removeItem("headingFix");
}


// 각도를 -180~180 범위로 (예: 350 → -10, -190 → 170)
function wrap180(a) {
    return ((a + 540) % 360) - 180;
}

// 두 회전행렬 사이 각도(°). 방위·기울기·좌우 기울임 어느 축 변화든 하나의 각도로
function rotAngle(A, B) {
    var t = 0;
    for (var i = 0; i < 9; i++) t += A[i] * B[i];// = trace(Aᵀ·B). 같은 행렬이면 3
    return Math.acos(Math.max(-1, Math.min(1, (t - 1) / 2))) * DEG;// 회전각 θ는 trace = 1 + 2cosθ. 계산 오차로 ±1 넘는 것 방지
}

// 기기→지구 회전행렬 (W3C DeviceOrientation 규약: z축 alpha → x축 beta → y축 gamma 순서로 회전)
//  alpha: 폰을 평평히 두고 위에서 봤을 때 회전. 0=폰 상단이 북쪽, 반시계로 증가 (90=서쪽)
//  beta : 앞뒤 기울기. 0=평평(화면 위), 90=똑바로 세움, 음수=화면이 아래
//  gamma: 좌우 기울기. 0=수평, ±90=옆으로 세움
function rotMatrix(alpha, beta, gamma) {
    var cA = Math.cos(alpha * RAD), sA = Math.sin(alpha * RAD);
    var cB = Math.cos(beta * RAD), sB = Math.sin(beta * RAD);
    var cG = Math.cos(gamma * RAD), sG = Math.sin(gamma * RAD);
    return [
        cA * cG - sA * sB * sG, -cB * sA, cA * sG + cG * sA * sB,// 1행: 지구 동쪽 성분 (기기 x, y, z축 각각의)
        cG * sA + cA * sB * sG,  cA * cB, sA * sG - cA * cG * sB,// 2행: 지구 북쪽 성분
        -cB * sG,                sB,      cB * cG                 // 3행: 지구 위쪽 성분. r7 = sB: 폰 세우면(beta=90) y축이 위를 향함
    ];
}

// 카메라(-z)가 보는 방위 (0=북, 90=동)
function headingOf(R) {
    // 3열(r2, r5) = 기기 z축의 동/북 성분. 카메라는 -z라 부호 반전. atan2(동, 북) = 북 기준 시계방향 각
    return (Math.atan2(-R[2], -R[5]) * DEG + 360) % 360;
}

// 지구 상(z)축 기준으로 theta(°)만큼 회전 (R ← Rz(theta)·R). 방위가 theta만큼 줄어듦 (반시계 회전 = 방위 감소)
function rotateYaw(R, theta) {
    var c = Math.cos(theta * RAD), s = Math.sin(theta * RAD);
    for (var i = 0; i < 3; i++) {// 열마다 (동, 북) 성분을 2D 회전. 위 성분(3행)은 그대로
        var r0 = R[i], r1 = R[3 + i];// 동 성분, 북 성분
        R[i] = c * r0 - s * r1;// 새 동
        R[3 + i] = s * r0 + c * r1;// 새 북
    }
}

// 지구좌표 오프셋(동,북,상 m) → 화면 px. 카메라 뒤쪽·화면 밖(50px 여유)이면 null
function camProject(R, east, north, up, width, height, f, screenAngle) {
    // 1. 지구 → 기기 (R의 전치 = 열끼리 내적). 기기 축: x=오른쪽, y=위, z=화면 밖 (카메라는 -z 방향)
    var dx = R[0] * east + R[3] * north + R[6] * up;// 기기 x 성분 = 카메라 기준 오른쪽 거리 m
    var dy = R[1] * east + R[4] * north + R[7] * up;// 기기 y 성분 = 카메라 기준 위쪽 거리 m
    var fwd = -(R[2] * east + R[5] * north + R[8] * up);// 앞쪽 거리 m (= -z). 0 이하면 카메라 뒤
    if (fwd <= 0) return null;
    // 2. 화면 회전 반영: 가로모드면 기기 x/y축이 화면에서 돌아가 있으므로 (dx, dy)를 screenAngle만큼 회전
    var c = Math.cos(screenAngle * RAD), s = Math.sin(screenAngle * RAD);
    // 3. 핀홀 투영: 화면 px = f · (옆 거리 / 앞 거리). 중앙(width/2, height/2)이 광축. y는 화면 아래가 +라 부호 반전
    var x = width / 2 + f * (c * dx - s * dy) / fwd;
    var y = height / 2 - f * (s * dx + c * dy) / fwd;
    if (x < -50 || x > width + 50 || y < -50 || y > height + 50) return null;
    return {x: x, y: y};
}

// 화면 px → 그 방향 광선의 방위 (camProject 역변환, 방위만). 탭 보정에 사용
function rayHeading(R, x, y, width, height, f, screenAngle) {
    var xs = (x - width / 2) / f, ys = -(y - height / 2) / f;// 화면 px → "앞 1m당 옆/위 m" (핀홀 역산). y 부호 반전
    var c = Math.cos(screenAngle * RAD), s = Math.sin(screenAngle * RAD);
    var dx = c * xs + s * ys, dy = -s * xs + c * ys;// 화면 회전 되돌림 (-screenAngle 회전)
    // 기기 벡터 (dx, dy, -1): 앞으로 1m 가며 옆 dx, 위 dy. 이를 지구 좌표로 (R의 행 × 벡터)
    var e = R[0] * dx + R[1] * dy - R[2];// 동 성분
    var n = R[3] * dx + R[4] * dy - R[5];// 북 성분
    return (Math.atan2(e, n) * DEG + 360) % 360;// 방위
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