var MH_all = [];
var mapHM_Over = [];

var roadUpdateTimer = null;
var roadDistance = 30;
var roadHM_Over = [];

var camUpdateTimer = null;
var camStream = null;
var camGeoWatchId = null;// GPS watchPosition ID
// 0 = 북쪽// 90 = 동쪽// 180 = 남쪽// 270 = 서쪽
var heading = null;// 현재 스마트폰 방향
var smoothHeading = null;// 부드럽게 보정된 방향
var devicePitch = 0;// 카메라의 상하 기울기
var CAMERA_FOV_X = 60;// 카메라 수평 FOV
var CAMERA_HEIGHT = 1.5;// 카메라 높이
var camDistance = 100;


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
    smoothHeading = null;
    devicePitch = 0;

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

    // 1. 나침반 방위각 (Heading) 구하기
    var rawHeading = null;

    if (event.webkitCompassHeading != null && 
        !isNaN(event.webkitCompassHeading)) { // iOS Safari
        rawHeading = event.webkitCompassHeading;
    } else if ( event.absolute === true && event.alpha != null &&
        !isNaN(event.alpha) ) {// Android (absolute orientation)
        rawHeading = 360 - event.alpha; // absolute orientation에서만 alpha 사용
    }

    if (rawHeading !== null) { // 보정 (Low-pass Filter) - 값이 흔들리는 현상 방지
        rawHeading = normalizeAngle(rawHeading);
        if (smoothHeading === null) smoothHeading = rawHeading;
        else {
            var diff = rawHeading - smoothHeading;
            if (diff > 180) diff -= 360; // 0 / 360 경계 보정
            if (diff < -180) diff += 360; // 0 / 360 경계 보정
            smoothHeading += diff * 0.10; // 방향 흔들림 완화
            smoothHeading = normalizeAngle(smoothHeading);
        }
        heading = smoothHeading;
    }

    // 2. 스마트폰 상하 기울기 (Pitch) 구하기 (도 단위)
    if (event.beta !== null) {
        devicePitch = event.beta; // 핸드폰을 수직으로 세우면 ~90도
    }

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
    if (cMode !== "cam" || !cmaPos || heading === null) return;

    var container = document.getElementById("camBox");
    var width = container.clientWidth;
    var height = container.clientHeight;

    // 1. SVG 컨테이너 초기화
    if (!camSVG) camSVG = document.getElementById('camSVG');
    camSVG.setAttribute("width", width);
    camSVG.setAttribute("height", height);
    camSVG.replaceChildren();

    // 2. camDistance(30m) 이내 맨홀 필터링 및 오버레이 그리기
    MH_all.forEach(function(mh) {
        var mhLat = mh.position.getLat();
        var mhLng = mh.position.getLng();

        // 거리 계산 (m)
        var line = new kakao.maps.Polyline({ path: [new kakao.maps.LatLng(cmaPos.lat, cmaPos.lng), mh.position] });
        var dist = line.getLength();

        if (dist <= camDistance) {
            // 방위각 및 각도 차이 계산
            var mhBearing = getBearing(cmaPos.lat, cmaPos.lng, mhLat, mhLng);
            var angleDiff = mhBearing - heading;

            if (angleDiff > 180) angleDiff -= 360;
            if (angleDiff < -180) angleDiff += 360;

            // 시야각(CAMERA_FOV_X) 내에 있을 때만 그리기
            if (Math.abs(angleDiff) <= CAMERA_FOV_X / 2) {
                // X 좌표 계산 (화면 중앙 = width/2 기준)
                var screenX = (width / 2) + (angleDiff / (CAMERA_FOV_X / 2)) * (width / 2);
                
                // Y 좌표: 피치/높이 제외하고 화면 중앙 고정
                var screenY = height / 2;

                // Y 좌표 계산 (화면 세로: 거리 및 카메라 높이 반영)
                // 카메라 높이(1.5m)와 거리(dist) 기준 시야각 계산
                //var vertAngle = Math.atan2(CAMERA_HEIGHT, dist) * (180 / Math.PI);
                // 기울기(devicePitch) 보정 후 Y 좌표 할당 (기본 중앙 아래쪽)
                //var pitchOffset = (devicePitch - 80) * 10; 
                //var screenY = (height / 2) + (vertAngle * 15) + pitchOffset;

                // 화면 범위를 벗어나지 않도록 제한
                //screenY = Math.max(50, Math.min(height - 50, screenY));

                // SVG 그룹 생성
                // HTML 컨텐츠 정의
                var content = `
                    <div class="mh-overlay" style="cursor:pointer;">
                        <img class="mh-icon" src="icon/mh.png" alt="맨홀">
                        <span class="mh-label">${mh.name} (${Math.round(dist)}m)</span>
                    </div>
                `;

                // 1. foreignObject 생성 (SVG 내부에서 HTML 표현을 위한 요소를 제공)
                var foreignObj = document.createElementNS("http://www.w3.org/2000/svg", "foreignObject");

                // 2. foreignObject의 위치 및 크기 설정 (원하는 overlay 크기로 조절하세요)
                foreignObj.setAttribute("x", screenX - 50); // 중심을 맞추기 위한 좌측 오프셋 (필요시 조정)
                foreignObj.setAttribute("y", screenY - 30); // 중심을 맞추기 위한 좌측 오프셋 (필요시 조정)
                foreignObj.setAttribute("width", "100");
                foreignObj.setAttribute("height", "60");

                // 3. HTML 문자열 할당
                foreignObj.innerHTML = content;

                camSVG.appendChild(foreignObj);
            }
        }
    });
}