var cameraStream = null;

var myLatitude = null;
var myLongitude = null;

var deviceHeading = 0;
var cameraFov = 60; // 카메라 수평 시야각
var pipeMaxDistance = 10; // 배관 표시 최대거리(m)

async function openCameraView() {
    document.getElementById('map').style.display = 'none';
    document.getElementById('road').style.display = 'none';
    document.getElementById("camera").style.display = 'block';

    document.getElementById('normalBtn').style.display = 'none';
    document.getElementById('skyviewBtn').style.display = 'none';
    document.getElementById('modeRoadBtn').style.display = 'none';
    document.getElementById('closeRoadBtn').style.display = 'none';
    document.getElementById('myLocationBtn').style.display = 'none';
    document.getElementById('openCameraBtn').style.display = 'none';
    document.getElementById('closeCameraBtn').style.display = 'block';

    try {
        cameraStream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: {
                    ideal: "environment"
                }
            },
            audio: false
        });

        video.srcObject = cameraStream;

        // 카메라가 열리면 현재 위치 가져오기
        startDeviceOrientation();
        getCurrentLocation();

        console.log("카메라 시작");

    } catch (error) {
        console.error("카메라 실행 실패:", error);
    }
}

// 현재 위치 가져오기
function getCurrentLocation() {
    console.log("getCurrentLocation 시작");

    if (!navigator.geolocation) {
        console.error("이 브라우저에서는 위치 정보를 사용할 수 없습니다.");
        return;
    }

    navigator.geolocation.getCurrentPosition(
        function(position) {
            myLatitude = position.coords.latitude;;
            myLongitude = position.coords.longitude;;

            console.log("현재 위치");
            console.log("latitude :", myLatitude);
            console.log("longitude:", myLongitude);
            console.log("accuracy :", position.coords.accuracy);

            drawCameraPipes();
        },

        function(error) {
            console.error("위치 가져오기 실패:", error);
        },

        {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
        }
    );
}

function getAngleDifference(targetAngle, currentAngle) {
    var diff = targetAngle - currentAngle;
    while (diff > 180) {diff -= 360;}
    while (diff < -180) {diff += 360;}
    return diff;
}

//스마트폰의 나침반 방향
function startDeviceOrientation() {
    window.addEventListener(
        "deviceorientationabsolute",
        handleDeviceOrientation,
        true
    );

    window.addEventListener(
        "deviceorientation",
        handleDeviceOrientation,
        true
    );
}
function handleDeviceOrientation(event) {
    var heading = null;

    // iPhone / iPad 계열
    if (event.webkitCompassHeading != null) {
        heading = event.webkitCompassHeading;
    }
    // Android 계열
    else if (event.alpha != null) {
        heading = 360 - event.alpha;
    }

    if (heading == null) return;

    heading = (heading + 360) % 360;
    deviceHeading = heading;
    drawCameraPipes();
}

function bearingToScreenX(angleDiff) {
    if (Math.abs(angleDiff) > cameraFov / 2) {
        return null;
    }

    var width = svg.clientWidth;

    var x =
        width / 2 +
        (angleDiff / (cameraFov / 2)) * (width / 2);

    return x;
}

function drawCameraPipePoint(x, y, color) {

    var circle = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "circle"
    );

    circle.setAttribute("cx", x);
    circle.setAttribute("cy", y);
    circle.setAttribute("r", 8);

    circle.setAttribute("fill", color || "red");

    svg.appendChild(circle);
}

function getNearestPipePoint(pipe) {

    if (!pipe.path || pipe.path.length === 0) {
        return null;
    }

    var nearest = null;
    var minDistance = Infinity;

    for (var i = 0; i < pipe.path.length; i++) {

        var point = pipe.path[i];

        var lat = point.getLat();
        var lng = point.getLng();

        var distance = getDistanceMeter(
            myLatitude,
            myLongitude,
            lat,
            lng
        );

        if (distance < minDistance) {

            minDistance = distance;

            nearest = {
                lat: lat,
                lng: lng,
                distance: distance
            };
        }
    }

    return nearest;
}

function drawCameraPipes() {

    if (!svg) {
        svg = document.getElementById("svg");
    }

    if (!svg) {
        return;
    }

    if (myLatitude == null || myLongitude == null) {
        return;
    }

    if (!Pipes_data || Pipes_data.length === 0) {
        return;
    }

    clearCameraSvg();

    var width = svg.clientWidth;
    var height = svg.clientHeight;

    console.log(
        "AR 계산",
        "위치:", myLatitude, myLongitude,
        "방향:", deviceHeading
    );

    for (var i = 0; i < Pipes_data.length; i++) {

        var pipe = Pipes_data[i];

        var nearest = getNearestPipePoint(pipe);

        if (!nearest) {
            continue;
        }

        // 너무 먼 배관은 제외
        if (nearest.distance > pipeMaxDistance) {
            continue;
        }

        // 내 위치 → 배관 방위각
        var bearing = getBearing(
            myLatitude,
            myLongitude,
            nearest.lat,
            nearest.lng
        );

        // 카메라 방향과 배관 방향의 차이
        var angleDiff = getAngleDifference(
            bearing,
            deviceHeading
        );

        // 카메라 시야 밖
        if (Math.abs(angleDiff) > cameraFov / 2) {
            continue;
        }

        // 화면 X 좌표
        var x = bearingToScreenX(angleDiff);

        if (x == null) {
            continue;
        }

        // 일단 화면 세로 중앙에 표시
        var y = height / 2;

        drawCameraPipePoint(
            x,
            y,
            "red"
        );

        console.log(
            "배관",
            i,
            "거리:", nearest.distance.toFixed(1) + "m",
            "방위각:", bearing.toFixed(1),
            "카메라:", deviceHeading.toFixed(1),
            "차이:", angleDiff.toFixed(1),
            "X:", x.toFixed(1)
        );
    }
}

function clearCameraSvg() {
    if (!svg) {
        svg = document.getElementById("svg");
    }

    svg.replaceChildren();
}


function closeCameraView() {
    document.getElementById('road').style.display = 'none';
    document.getElementById("camera").style.display = 'none';
    document.getElementById('map').style.display = 'block';
    
    document.getElementById('normalBtn').style.display = 'block';
    document.getElementById('skyviewBtn').style.display = 'block';
    document.getElementById('modeRoadBtn').style.display = 'block';
    document.getElementById('closeRoadBtn').style.display = 'none';
    if (isMobileDevice()) {
        document.getElementById('myLocationBtn').style.display = 'block';
        document.getElementById('openCameraBtn').style.display = 'block';
    }
    document.getElementById('closeCameraBtn').style.display = 'none';

    if (cameraStream) {
        cameraStream.getTracks().forEach(function(track) {
            track.stop();
        });
        cameraStream = null;
    }

    if (video) {
        video.srcObject = null;
    }
}