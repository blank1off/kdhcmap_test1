var camStream = null;
var camUpdateTimer = null;

var CCPos = null;
var devicePitch = 0; // 카메라 상하 기울기 (기본값 0: 정면 주시)
var heading = null;
var smoothHeading = null;

var camPoints = [];

var CAMERA_FOV = 60;
var CAMERA_MAX_DISTANCE = 10;
var CAMERA_FOV_X = 60; // 가로 FOV
var CAMERA_HEIGHT = 1.5; // 스마트폰을 들고 있는 높이 (지면으로부터 약 1.5m)

var targetDistance = 30;

async function openCamView() {
    cMode = "cam";
    allNone();
    document.getElementById("camBox").style.display = 'block';
    document.getElementById('closeCamBtn').style.display = 'block';

    try {
        camStream = await navigator.mediaDevices.getUserMedia({
            video: {facingMode: {ideal: "environment"}},
            audio: false
        });

        camView.srcObject = camStream;

        // iOS 센서 권한 요청 및 이벤트 등록
        if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
            DeviceOrientationEvent.requestPermission()
                .then(function(response) {
                    if (response === 'granted') {
                        window.addEventListener("deviceorientation", camEvent, true);
                    }
                })
                .catch(console.error);
        } else {
            // Android 및 기타 브라우저
            if ("ondeviceorientationabsolute" in window) {
                window.addEventListener("deviceorientationabsolute", camEvent, true);
            } else {
                window.addEventListener("deviceorientation", camEvent, true);
            }
        }

    } catch (error) {
        console.error("카메라 실행 실패:", error);
        closeCamView();
    }
}
function closeCamView() {
    cMode = "map";
    allNone();
    document.getElementById('map').style.display = 'block';
    document.getElementById('normalBtn').style.display = 'block';
    document.getElementById('satelliteBtn').style.display = 'block';
    document.getElementById('myLocationBtn').style.display = 'block';
    document.getElementById('roadModeBtn').style.display = 'block';
    document.getElementById('openCamBtn').style.display = 'block';

    // 센서 이벤트 해제 (자원 절약)
    window.removeEventListener("deviceorientationabsolute", camEvent, true);
    window.removeEventListener("deviceorientation", camEvent, true);

    if (camStream) {
        camStream.getTracks().forEach(function(track) {
            track.stop();
        });
        camStream = null;
    }

    if (camView) camView.srcObject = null;
}

// deviceorientation 이벤트 발생 시 pitch(beta) 값 수집 추가
function camEvent(event) {
    if (cMode !== "cam") return;
    
    // 스마트폰 기울기(Pitch) 수집 (기본 세로 모드 기준 beta 사용)
    // 스마트폰을 수직으로 세웠을 때(90도)를 Pitch 0도로 맞춤
    if (event.beta != null) devicePitch = event.beta - 90; 
    camUpdate(event);

    //if (camSVG) camSVG.replaceChildren();
    //if (camUpdateTimer) clearTimeout(camUpdateTimer);
    //camUpdateTimer = setTimeout(function() { camUpdate(event); }, 50);
}
function camUpdate(event) {
    /*/가짜 camPosition 만들기
    var tlat = 37.369932982787454;
    var tlng = 127.10797640931209;
    // GPS 수신 함수 대신 가짜 위치 전달
    CCPos = {lat: tlat, lng: tlng};*/
    // 현재 카메라 위치
    navigator.geolocation.watchPosition(
        function(position) {
            CCPos = {
                lat: position.coords.latitude,
                lng: position.coords.longitude
            };
        },
        function(error) {
            console.log("GPS 오류:", error);
        },
        {
            enableHighAccuracy: true,
            maximumAge: 1000,
            timeout: 10000
        }
    );

    if (CCPos == null) {
        console.log("현재 카메라 위치가 없습니다.");
        return;
    }

    // 현재 카메라 방향
    // iPhone / iPad 계열
    if (event.webkitCompassHeading != null) heading = event.webkitCompassHeading;
    // Android 계열
    else if (event.alpha != null) heading = 360 - event.alpha;

    if (heading == null) return;
    if (smoothHeading == null) {
        smoothHeading = heading;
        return smoothHeading;
    }

    var diff = heading - smoothHeading;
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;

    smoothHeading += diff * 0.1;
    if (smoothHeading < 0) smoothHeading += 360;
    if (smoothHeading >= 360) smoothHeading -= 360;

    heading = smoothHeading;

    camSVG.replaceChildren();// 기존 점 삭제

    PPG_cam();
    requestAnimationFrame(function() {
        drawProjectedPoint();
    });
}

function PPG_cam(){
    camPoints = [];

    if (!all_PPG || all_PPG.length === 0) return;

    all_PPG.forEach(function(PPG, PPGidx) {
        if (!PPG.coords || PPG.coords.length < 2) return;

        for (var idx = 0; idx < PPG.coords.length - 1; idx++) {
            var pos1 = PPG.coords[idx];
            var pos2 = PPG.coords[idx + 1];

            var dist1 = getDistanceMeter(CCPos.lat, CCPos.lng, pos1.getLat(), pos1.getLng());
            var dist2 = getDistanceMeter(CCPos.lat, CCPos.lng, pos2.getLat(), pos2.getLng());

            if (dist1 <= targetDistance || dist2 <= targetDistance) {
                var color = '#888888';
                if (PPG.srCode === 'S') color = '#FF0000';
                if (PPG.srCode === 'R') color = '#FFA000';

                camPoints.push({
                    PPGidx: PPGidx,
                    pointIdx: idx,
                    pos1: pos1,
                    pos2: pos2,
                    color: color,
                    diaCode: PPG.diaCode,
                    srCode: PPG.srCode
                });
            }
        }
    });
}

// 카메라 AR 화면 투영 및 4가지 조건별 그리기
function drawProjectedPoint() {
    var rect = camSVG.getBoundingClientRect();
    var width = rect.width;
    var height = rect.height;
    if (width <= 0 || height <= 0) return;

    var centerX = width / 2;

    camPoints.forEach(function(segment) {
        // 1. 카메라 위치(CCPos)와 선분(pos1~pos2) 사이의 최소 거리가 범위(targetDistance) 이내인지 검사
        var closestPt = getClosestPointOnLine(
            CCPos.lat, CCPos.lng,
            segment.pos1.getLat(), segment.pos1.getLng(),
            segment.pos2.getLat(), segment.pos2.getLng()
        );
        var minDistance = getDistanceMeter(CCPos.lat, CCPos.lng, closestPt.lat, closestPt.lng);
        
        // 최소 거리가 범위를 초과하면 패스
        if (minDistance > targetDistance) return;

        // 투영 좌표 및 화면 내 존재 여부(visible) 계산
        var pt1 = projectLatLngToScreen(segment.pos1, width, height, centerX, segment.avgDph);
        var pt2 = projectLatLngToScreen(segment.pos2, width, height, centerX, segment.avgDph);
        //var pt1 = projectLatLngToScreen(segment.pos1, width, height, centerX);
        //var pt2 = projectLatLngToScreen(segment.pos2, width, height, centerX);

        // ----------------------------------------------------
        // 조건 2: 두 점이 모두 화면 내에 있는 경우
        // ----------------------------------------------------
        if (pt1.visible && pt2.visible) {
            lineDrawCam(pt1.x, pt1.y, pt2.x, pt2.y, segment.color);
            drawCamCircle(pt1.x, pt1.y, segment.color);
            drawCamCircle(pt2.x, pt2.y, segment.color);
        }
        // ----------------------------------------------------
        // 조건 3-1: pos1만 화면 내에 있고, pos2는 바깥인 경우
        // ----------------------------------------------------
        else if (pt1.visible && !pt2.visible) {
            drawCamCircle(pt1.x, pt1.y, segment.color);
            
            // pos1 -> pos2 방향으로 가상점 탐색 후 화면 경계까지 연장
            var tempPt = findCamTempPoint(segment.pos1, segment.pos2, width, height, centerX);
            if (tempPt) {
                var dx = tempPt.x - pt1.x;
                var dy = tempPt.y - pt1.y;
                var edge = extendCamToEdge(pt1.x, pt1.y, dx, dy, width, height);
                lineDrawCam(pt1.x, pt1.y, edge.x, edge.y, segment.color);
            }
        }
        // ----------------------------------------------------
        // 조건 3-2: pos2만 화면 내에 있고, pos1은 바깥인 경우
        // ----------------------------------------------------
        else if (!pt1.visible && pt2.visible) {
            drawCamCircle(pt2.x, pt2.y, segment.color);

            // pos2 -> pos1 방향으로 가상점 탐색 후 화면 경계까지 연장
            var tempPt = findCamTempPoint(segment.pos2, segment.pos1, width, height, centerX);
            if (tempPt) {
                var dx = tempPt.x - pt2.x;
                var dy = tempPt.y - pt2.y;
                var edge = extendCamToEdge(pt2.x, pt2.y, dx, dy, width, height);
                lineDrawCam(pt2.x, pt2.y, edge.x, edge.y, segment.color);
            }
        }
        // ----------------------------------------------------
        // 조건 4: 두 점 모두 화면 바깥에 있는 경우
        // ----------------------------------------------------
        else if (!pt1.visible && !pt2.visible) {
            // 선분이 화면을 관통하는지 검사하기 위해 2개의 가상점 탐색
            var tempPair = findCamTempPointPair(segment.pos1, segment.pos2, width, height, centerX);
            if (tempPair.pt1 && tempPair.pt2) {
                var dx = tempPair.pt1.x - tempPair.pt2.x;
                var dy = tempPair.pt1.y - tempPair.pt2.y;

                // 두 가상점을 잇는 방향으로 양쪽 화면 경계까지 연장
                var edge1 = extendCamToEdge(tempPair.pt1.x, tempPair.pt1.y, dx, dy, width, height);
                var edge2 = extendCamToEdge(tempPair.pt2.x, tempPair.pt2.y, -dx, -dy, width, height);

                lineDrawCam(edge1.x, edge1.y, edge2.x, edge2.y, segment.color);
            }
        }
    });
}

function projectLatLngToScreen(latLng, width, height, centerX, avgDph) {
    var lat = latLng.getLat();
    var lng = latLng.getLng();

    // 1. 평면 거리 및 방위각 계산
    var distance = getDistanceMeter(CCPos.lat, CCPos.lng, lat, lng);
    var bearing = getBearing(CCPos.lat, CCPos.lng, lat, lng);

    // 2. 가로(X) 상대각 계산
    var relativeAngleX = bearing - heading;
    while (relativeAngleX > 180) { relativeAngleX -= 360; }
    while (relativeAngleX < -180) { relativeAngleX += 360; }

    // 가로 FOV 벗어남 또는 거리 초과 검사
    if (Math.abs(relativeAngleX) > CAMERA_FOV_X / 2 || distance > targetDistance || distance < 0.1) {
        return { visible: false };
    }

    // 3. 화면 X 좌표 (가로)
    var x = centerX + (Math.tan(relativeAngleX * Math.PI / 180) / Math.tan((CAMERA_FOV_X / 2) * Math.PI / 180)) * centerX;

    // ----------------------------------------------------
    // 4. 세로(Y) 원근 투영 계산 (개선 파트)
    // ----------------------------------------------------
    // 배관 심도 적용 (dph 값이 없으면 기본 1.2m 매설로 가정)
    var depth = (avgDph !== undefined && !isNaN(parseFloat(avgDph))) ? parseFloat(avgDph) : 1.2;
    
    // 고도차 계산: 카메라 높이(+1.5m) ~ 매설 깊이(-depth)
    var deltaH = - (CAMERA_HEIGHT + depth); // 지하에 있으므로 음수 높이차

    // 카메라 기준 고도 각도 (rad)
    var elevationAngle = Math.atan2(deltaH, distance) * (180 / Math.PI); // 도 단위 변환

    // 스마트폰 피치(기울기) 보정 반영
    var relativeAngleY = elevationAngle - devicePitch;

    // 화면 비율(Aspect Ratio)에 맞춘 수직 FOV_Y 계산
    var fovY = 2 * Math.atan(Math.tan((CAMERA_FOV_X / 2) * Math.PI / 180) * (height / width)) * (180 / Math.PI);

    // 수직 FOV 범위를 벗어나면 원근 투영 왜곡 방지를 위해 가시성 제외
    if (Math.abs(relativeAngleY) > fovY / 2) {
        return { visible: false };
    }

    // 화면 Y 좌표 투영 (화면 중심 = height/2)
    var centerY = height / 2;
    var y = centerY - (Math.tan(relativeAngleY * Math.PI / 180) / Math.tan((fovY / 2) * Math.PI / 180)) * centerY;

    return { visible: true, x: x, y: y };
}

// 카메라 SVG 원 생성 함수
function drawCamCircle(x, y, color) {
    var circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", x);
    circle.setAttribute("cy", y);
    circle.setAttribute("r", "5");
    circle.setAttribute("fill", color);
    camSVG.appendChild(circle);
}

// ----------------------------------------------------
// 보조 함수 1: 단일 가상점 찾기 (내분점 탐색)
// ----------------------------------------------------
function findCamTempPoint(fromPath, toPath, width, height, centerX) {
    var ratios = [0.8, 0.5, 0.2, 0.05];
    for (var i = 0; i < ratios.length; i++) {
        var point = getPointAtRatio(fromPath, toPath, ratios[i]);
        var proj = projectLatLngToScreen(point, width, height, centerX);
        if (proj.visible) {
            return { x: proj.x, y: proj.y };
        }
    }
    return null;
}

// ----------------------------------------------------
// 보조 함수 2: 양쪽 가상점 쌍 찾기 (관통 처리용)
// ----------------------------------------------------
function findCamTempPointPair(pos1, pos2, width, height, centerX) {
    var ratios = [0.1, 0.3, 0.5, 0.7, 0.9];
    var v1 = null, v2 = null;

    for (var i = 0; i < ratios.length; i++) {
        var point1 = getPointAtRatio(pos1, pos2, ratios[i]);
        var proj1 = projectLatLngToScreen(point1, width, height, centerX);
        if (proj1.visible) {
            v1 = { x: proj1.x, y: proj1.y };
            break;
        }
    }

    for (var i = 0; i < ratios.length; i++) {
        var point2 = getPointAtRatio(pos2, pos1, ratios[i]);
        var proj2 = projectLatLngToScreen(point2, width, height, centerX);
        if (proj2.visible) {
            v2 = { x: proj2.x, y: proj2.y };
            break;
        }
    }

    return { pt1: v1, pt2: v2 };
}

// ----------------------------------------------------
// 보조 함수 3: 방향 벡터 기준 화면 테두리 끝점 연장
// ----------------------------------------------------
function extendCamToEdge(x1, y1, dx, dy, width, height) {
    var len = Math.sqrt(dx * dx + dy * dy);
    if (len < 0.000001) return { x: x1, y: y1 };

    dx /= len;
    dy /= len;

    var candidates = [];

    if (dx > 0) {
        var t = (width - x1) / dx;
        var y = y1 + dy * t;
        if (t >= 0 && y >= 0 && y <= height) candidates.push({ t: t, x: width, y: y });
    }
    if (dx < 0) {
        var t = (0 - x1) / dx;
        var y = y1 + dy * t;
        if (t >= 0 && y >= 0 && y <= height) candidates.push({ t: t, x: 0, y: y });
    }
    if (dy > 0) {
        var t = (height - y1) / dy;
        var x = x1 + dx * t;
        if (t >= 0 && x >= 0 && x <= width) candidates.push({ t: t, x: x, y: height });
    }
    if (dy < 0) {
        var t = (0 - y1) / dy;
        var x = x1 + dx * t;
        if (t >= 0 && x >= 0 && x <= width) candidates.push({ t: t, x: x, y: 0 });
    }

    if (candidates.length === 0) return { x: x1, y: y1 };
    candidates.sort(function(a, b) { return b.t - a.t; });

    return { x: candidates[0].x, y: candidates[0].y };
}

// ----------------------------------------------------
// 보조 함수 4: 카메라 전용 SVG 선 그리기
// ----------------------------------------------------
function lineDrawCam(x1, y1, x2, y2, color) {
    var line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', x1.toFixed(1));
    line.setAttribute('y1', y1.toFixed(1));
    line.setAttribute('x2', x2.toFixed(1));
    line.setAttribute('y2', y2.toFixed(1));
    line.setAttribute('stroke', color);
    line.setAttribute('stroke-width', '3');
    line.setAttribute('opacity', '0.85');
    camSVG.appendChild(line);
}