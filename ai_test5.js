var MH_all = [];
var mapHM_Over = [];

var roadUpdateTimer = null;
var roadDistance = 30;
var roadHM_Over = [];

var camUpdateTimer = null;
var camStream = null;
var camGeoWatchId = null;// GPS watchPosition ID
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
var YAW_FILTER = 0.01;// 나침반 보정 속도. 작을수록 안 떨리지만 방위 오차 잡는 데 오래 걸림 (0.01 ≈ 2초)
var GPS_FILTER = 0.3;// GPS 위치 필터. 1이면 필터 없음. 작을수록 제자리 떨림 줄고 걸을 때 지연 큼
var CAMERA_FOV = 69;// 카메라 화각(°, 영상 긴 변 기준). 보통 65~75. 마커 간격이 실제보다 좁거나 넓으면 조정
var CAMERA_HEIGHT = 1.5;// 카메라 높이(m). 맨홀은 지면이라 이만큼 아래에 그림
var MAG_DECLINATION = -8.7;// 자기 편각(°). 분당 2026년 약 -8.7(서편각)
var camDistance = 100;// 표시 범위(m)
var ROAD_ALTITUDE = -2.5;// 로드뷰 오버레이 고도(m). 로드뷰는 카메라 높이가 0이라 지면 = 카메라 높이만큼 음수. 마커가 땅 위에 떠 보이면 더 작게(-3), 땅에 박히면 더 크게(-2)
var testMH = null;// 시험용 임시 지점 (카메라 열 때 위치 기준 북쪽 20m, 이후 고정)


function loadMH(filePath) {
    fetch(filePath)
        .then(function(response) {
            if (!response.ok) throw new Error("CSV 파일 로드 실패");
            return response.text();
        })
        .then(function(csvText) {
            parseMH(csvText);
            mapMH();
        })
        .catch(function(error) {
            console.error("맨홀 데이터 로드 오류:", error);
        });
}

function parseMH(csvText) {
    MH_all = [];

    var lines = csvText.trim().split('\n');
    if (lines.length <= 1) return;

    for (var i = 1; i < lines.length; i++) {
        var line = lines[i].trim();
        if (!line) continue;

        var columns = line.split(',');

        var name = columns[0] ? columns[0].trim() : '';
        var lng = columns[1] ? parseFloat(columns[1].trim()) : 0;
        var lat = columns[2] ? parseFloat(columns[2].trim()) : 0;

        if (isNaN(lat) || isNaN(lng) || lat === 0 || lng === 0) continue;

        try {
            MH_all.push({
                name: name,
                position: new kakao.maps.LatLng(lat, lng)
            });
        } catch (e) {
            console.error(i + "번째 행 맨홀 좌표 변환 실패:", e);
        }
    }
}

function mapMH() {
    if (!map || MH_all.length === 0) return;

    // 기존 표시된 맨홀 제거
    for (var i = 0; i < mapHM_Over.length; i++) {
        mapHM_Over[i].setMap(null);
    }
    mapHM_Over = [];

    // 지도가 일정 레벨 이상으로 멀어지면 표시 안 함 (필요시 조정 가능)
    if (map.getLevel() > 3) return;

    // 현재 지도의 영역 좌표 가져오기
    var bounds = map.getBounds();

    MH_all.forEach(function(mh) {
        if (bounds.contain(mh.position)) {// 현재 화면 범위(Bounds) 안에 위치하는지 체크
            // CustomOverlay HTML 내용 (아이콘 + 하단 글씨)
            var content = `
                <div class="mh-overlay">
                    <img class="mh-icon" src="icon/mh.png" alt="맨홀">
                    <span class="mh-label">${mh.name}</span>
                </div>
            `;

            var customOverlay = new kakao.maps.CustomOverlay({
                position: mh.position,
                content: content,
                xAnchor: 0.5,
                yAnchor: 0.5
            });

            customOverlay.setMap(map);
            mapHM_Over.push(customOverlay);
        }
    });
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

    // 1. 기존 로드뷰 오버레이 정리
    for (var i = 0; i < roadHM_Over.length; i++) {
        roadHM_Over[i].setMap(null);
    }
    roadHM_Over = [];

    // 2. 로드뷰의 현재 위치 좌표 가져오기
    var roadPos = roadView.getPosition();
    if (!roadPos) return;

    // 3. roadDistance(30m) 이내 맨홀만 필터링 후 오버레이 생성
    MH_all.forEach(function(mh) {
        var line = new kakao.maps.Polyline({path: [roadPos, mh.position]});
        var dist = line.getLength(); // m 단위 반환

        if (dist <= roadDistance) {
            // CustomOverlay HTML 생성
            var content = `
                <div class="mh-overlay" style="cursor:pointer;">
                    <img class="mh-icon" src="icon/mh.png" alt="맨홀">
                    <span class="mh-label">${mh.name} (${Math.round(dist)}m)</span>
                </div>
            `;

            var customOverlay = new kakao.maps.CustomOverlay({
                position: mh.position,
                content: content,
                xAnchor: 0.5,
                yAnchor: 0.5
            });

            // ★ 로드뷰(roadView)에 오버레이 올리기. 고도 안 주면 0 = 카메라 높이(화면 중앙)에 떠서 실제보다 멀리 보임
            customOverlay.setAltitude(ROAD_ALTITUDE);
            customOverlay.setMap(roadView);
            roadHM_Over.push(customOverlay);
        }
    });
}

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
            '<div>TEST : <span id="indTest">-</span></div>' +
            '<div>DIST : <span id="indDist">-</span></div>' +
            '<div>XY : <span id="indXY">-</span></div>');
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
    testMH = null;

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

    //getCameraLocation();// GPS 시작
    if (!navigator.geolocation) {
        alert("이 기기에서는 위치 정보를 사용할 수 없습니다.");
        return;
    }
    console.log("현재 위치 확인 중...");

    // 최초 위치
    navigator.geolocation.getCurrentPosition(
        function(position) {
            setPos(position);
            console.log("현재 위치:",cmaPos.lat,cmaPos.lng);
            drawCam();// 화면 표시
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
            setPos(position);

            if (camUpdateTimer) return;
            camUpdateTimer = requestAnimationFrame(function() {
                camUpdateTimer = null;
                drawCam();// 화면 표시
            });
        },
        function(error) {
            console.log("GPS watch 오류:",error);
        },
        {enableHighAccuracy: true,maximumAge: 3000,timeout: 10000}
    );

    console.log("GPS watch 시작:",camGeoWatchId);
}

// GPS 위치 반영. 제자리 떨림 완화용 저역 필터 (GPS_FILTER)
function setPos(position) {
    var c = position.coords;
    if (!cmaPos) cmaPos = {lat: c.latitude, lng: c.longitude, acc: c.accuracy};
    else {
        cmaPos.lat += (c.latitude - cmaPos.lat) * GPS_FILTER;
        cmaPos.lng += (c.longitude - cmaPos.lng) * GPS_FILTER;
        cmaPos.acc = c.accuracy;
    }
}

function closeCam() {
    cMode = "map";
    allNone();
    document.getElementById('map').style.display = 'block';
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

    // 화면 갱신
    if (!camUpdateTimer) {
        camUpdateTimer = requestAnimationFrame(function() {
            camUpdateTimer = null;
            drawCam();
        });
    }
}

// 화면에서 실제 맨홀 위치를 탭 → 가장 가까운 마커가 그 자리에 오도록 수동 방위 보정 (TEST 지점은 제외)
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
    var tapHead = rayHeading(camRot, tx, ty, d.width, d.height, d.f, d.screenAngle);
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

// 카메라 화면에 맨홀 오버레이 그리기
function drawCam() {
    if (cMode !== "cam" || !cmaPos) return;

    // 시험용: 첫 위치 기준 북쪽 20m에 임시 지점 고정. 걸어가면 거리 줄어야 함. 카메라 다시 열면 재설정
    if (!testMH) testMH = {name: "TEST", position: new kakao.maps.LatLng(cmaPos.lat + 20 / 111320, cmaPos.lng)};
    document.getElementById("indMe").textContent =
        cmaPos.lat.toFixed(6) + ", " + cmaPos.lng.toFixed(6) + " (±" + Math.round(cmaPos.acc) + "m)";
    document.getElementById("indTest").textContent =
        testMH.position.getLat().toFixed(6) + ", " + testMH.position.getLng().toFixed(6);
    if (!camRot) {
        document.getElementById("indXY").textContent = "센서 없음 (절대 방위 이벤트 안 옴)";
        return;
    }

    var container = document.getElementById("camBox");
    var width = container.clientWidth;
    var height = container.clientHeight;

    // 1. SVG 컨테이너 초기화
    if (!camSVG) camSVG = document.getElementById('camSVG');
    camSVG.setAttribute("width", width);
    camSVG.setAttribute("height", height);
    // 시험용: 중앙 십자선. 방위 0(북쪽)이면 TEST가 세로선 위, 폰 똑바로 세우면 가로선 조금 아래(카메라 높이 1.5m)
    camSVG.innerHTML = '<line x1="' + width / 2 + '" y1="0" x2="' + width / 2 + '" y2="' + height + '" stroke="#0f0" opacity="0.6"/>' +
        '<line x1="0" y1="' + height / 2 + '" x2="' + width + '" y2="' + height / 2 + '" stroke="#0f0" opacity="0.6"/>';

    // 2. 초점거리(px): 영상 긴 변 화각 기준, object-fit:cover 확대율 반영
    var vw = camView.videoWidth || width, vh = camView.videoHeight || height;
    var f = Math.max(width / vw, height / vh) * Math.max(vw, vh) / 2 / Math.tan(CAMERA_FOV / 2 * RAD);
    var screenAngle = (screen.orientation ? screen.orientation.angle : window.orientation) || 0;// 가로모드 회전
    var cosLat = Math.cos(cmaPos.lat * RAD);
    drawn = [];
    lastDraw = {width: width, height: height, f: f, screenAngle: screenAngle};

    // 3. camDistance 이내 맨홀을 카메라 화면에 투영
    MH_all.concat(testMH).forEach(function(mh) {
        // 내 위치 기준 동/북 거리(m). 맨홀은 지면이라 상하 = -CAMERA_HEIGHT
        var east = (mh.position.getLng() - cmaPos.lng) * 111320 * cosLat;
        var north = (mh.position.getLat() - cmaPos.lat) * 111320;
        var dist = Math.hypot(east, north);
        var p = dist <= camDistance ? camProject(camRot, east, north, -CAMERA_HEIGHT, width, height, f, screenAngle) : null;

        if (mh === testMH) {// 시험용: TEST 지점 상태 표시
            var brg = (Math.atan2(east, north) * DEG + 360) % 360;
            var diff = wrap180(brg - heading);// 카메라 방위 기준 좌(-)/우(+) 각도
            document.getElementById("indDist").textContent = Math.round(dist) + "m 방위 " + brg.toFixed(0) +
                "° 차이 " + diff.toFixed(0) + "° (보이는 범위 ±" + (Math.atan(width / 2 / f) * DEG).toFixed(0) + "°, 화면회전 " + screenAngle + ")";
            document.getElementById("indXY").textContent = p ? Math.round(p.x) + ", " + Math.round(p.y) :
                (dist > camDistance ? "표시 범위 밖" : "카메라 뒤쪽/화면 밖");
        }
        if (!p) return;// 카메라 뒤쪽 또는 화면 밖
        if (mh !== testMH) drawn.push({x: p.x, y: p.y, mh: mh});

        // 시험용: foreignObject와 별개로 순수 SVG 점. 점만 보이면 foreignObject 문제
        var dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        dot.setAttribute("cx", p.x); dot.setAttribute("cy", p.y); dot.setAttribute("r", 6); dot.setAttribute("fill", "red");
        camSVG.appendChild(dot);

        var content = `
            <div class="mh-overlay" style="cursor:pointer;">
                <img class="mh-icon" src="icon/mh.png" alt="맨홀">
                <span class="mh-label">${mh.name} (${Math.round(dist)}m)</span>
            </div>
        `;

        // foreignObject (SVG 안에 HTML 표시)
        var foreignObj = document.createElementNS("http://www.w3.org/2000/svg", "foreignObject");
        foreignObj.setAttribute("x", p.x - 50);// 가로 중앙 맞춤
        foreignObj.setAttribute("y", p.y - 12);// 아이콘(24px) 중심을 맨홀 위치에
        foreignObj.setAttribute("width", "100");
        foreignObj.setAttribute("height", "60");
        foreignObj.innerHTML = content;

        camSVG.appendChild(foreignObj);
    });
}

// 각도를 -180~180 범위로
function wrap180(a) {
    return ((a + 540) % 360) - 180;
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
