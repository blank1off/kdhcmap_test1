var cameraStream = null;

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

            var lat = position.coords.latitude;
            var lng = position.coords.longitude;

            console.log("현재 위치");
            console.log("latitude :", lat);
            console.log("longitude:", lng);

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