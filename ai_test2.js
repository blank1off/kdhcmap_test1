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
var heading = null;// 카메라가 보는 방위 (평활화)
var camRot = null;// 기기→지구 회전행렬 9개 (평활화). null이면 센서값 없음
var CAMERA_FOV = 69;// 카메라 화각(°, 영상 긴 변 기준). 보통 65~75. 마커 간격이 실제보다 좁거나 넓으면 조정
var CAMERA_HEIGHT = 1.5;// 카메라 높이(m). 맨홀은 지면이라 이만큼 아래에 그림
var MAG_DECLINATION = -8.7;// 자기 편각(°). 분당 2026년 약 -8.7(서편각). 마커가 전체적으로 좌/우 치우치면 조정
var camDistance = 100;// 표시 범위(m)
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

            // ★ 로드뷰(roadView)에 오버레이 올리기
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

    // 이전 상태 초기화
    cmaPos = null;
    heading = null;
    camRot = null;
    testMH = null;

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
            cmaPos = {
                lat:position.coords.latitude,
                lng:position.coords.longitude
            };
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
            cmaPos = {
                lat:position.coords.latitude,
                lng:position.coords.longitude
            };

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

    // 방향 센서 시작
    // iPhone / iPad
    if (typeof DeviceOrientationEvent !== "undefined" &&
    typeof DeviceOrientationEvent.requestPermission === "function") {
        DeviceOrientationEvent.requestPermission()
        .then(function(permission) {
            if (permission === "granted") {
                window.addEventListener("deviceorientation",camEvent,true);
                console.log("iOS 방향 센서 시작");
            }
            else console.log("방향 센서 권한 거부");
        })
        .catch(function(error) {
            console.error("방향 센서 권한 오류:",error);
        });
    }
    // Android
    window.addEventListener("deviceorientationabsolute",camEvent,true);
    window.addEventListener("deviceorientation",camEvent,true);
    console.log("Android 방향 센서 시작");
}

function closeCam() {
    cMode = "map";
    allNone();
    document.getElementById('map').style.display = 'block';
    document.getElementById('BtnMyLoc').style.display = 'block';
    document.getElementById('BtnRoadMode').style.display = 'block';
    document.getElementById('BtnOpenCam').style.display = 'block';

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

// 센서 이벤트 처리 (스마트폰 나침반 및 기울기)
function camEvent(event) {
    if (cMode !== "cam") return;

    // 절대 방위 없는 이벤트(안드로이드 상대 orientation 등)는 버림
    var compass = event.webkitCompassHeading;// iOS: 카메라가 보는 자북 방위
    if (compass == null && event.absolute !== true) return;
    if (event.alpha == null || event.beta == null || event.gamma == null) return;

    // 1. 기기 회전행렬 (폰을 세우면 alpha 혼자서는 불안정 → alpha/beta/gamma 전부 사용)
    var R = rotMatrix(event.alpha, event.beta, event.gamma);

    // 2. 방위 보정: iOS는 alpha가 상대값이라 나침반 값으로 맞춤. 자기 편각도 함께 보정
    var hMag = compass != null ? compass : headingOf(R);
    rotateYaw(R, headingOf(R) - hMag - MAG_DECLINATION);

    // 3. 보정 (Low-pass Filter) - 값이 흔들리는 현상 방지
    if (!camRot) camRot = R;
    else for (var i = 0; i < 9; i++) camRot[i] += (R[i] - camRot[i]) * 0.10;
    heading = headingOf(camRot);

    // 센서값 표시
    document.getElementById("indAlpha").textContent = event.alpha.toFixed(2);
    document.getElementById("indBeta").textContent = event.beta.toFixed(2);
    document.getElementById("indGamma").textContent = event.gamma.toFixed(2);
    document.getElementById("indAbsolute").textContent = event.absolute;
    document.getElementById("indHeading").textContent = heading.toFixed(2);

    // 화면 갱신
    if (!camUpdateTimer) {
        camUpdateTimer = requestAnimationFrame(function() {
            camUpdateTimer = null;
            drawCam();
        });
    }
}

// 카메라 화면에 맨홀 오버레이 그리기
function drawCam() {
    if (cMode !== "cam" || !cmaPos || !camRot) return;

    // 시험용: 첫 위치 기준 북쪽 20m에 임시 지점 고정. 걸어가면 거리 줄어야 함. 카메라 다시 열면 재설정
    if (!testMH) testMH = {name: "TEST", position: new kakao.maps.LatLng(cmaPos.lat + 20 / 111320, cmaPos.lng)};

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

    // 3. camDistance 이내 맨홀을 카메라 화면에 투영
    MH_all.concat(testMH).forEach(function(mh) {
        // 내 위치 기준 동/북 거리(m). 맨홀은 지면이라 상하 = -CAMERA_HEIGHT
        var east = (mh.position.getLng() - cmaPos.lng) * 111320 * cosLat;
        var north = (mh.position.getLat() - cmaPos.lat) * 111320;
        var dist = Math.hypot(east, north);
        if (dist > camDistance) return;

        var p = camProject(camRot, east, north, -CAMERA_HEIGHT, width, height, f, screenAngle);
        if (!p) return;// 카메라 뒤쪽 또는 화면 밖

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
