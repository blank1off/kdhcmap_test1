var allMH = [];
var onMH = [];
var overMH = [];
var rvOverMH = [];

// 맨홀 마커 이미지 설정 (이미지 경로 및 크기 지정)
var mhImageSrc = null;
var mhImageSize = null;
var mhImageOption = null;
var mhMarkerImage = null;

// CSV 파일 읽어오기
function loadMH(filePath) {
    fetch(filePath)
        .then(function(response) {
            if (!response.ok) throw new Error("CSV 파일 로드 실패");
            return response.text();
        })
        .then(function(csvText) {
            allMH = [];
            parseMH(csvText);
        })
        .catch(function(error) {
            console.error("맨홀 데이터 로드 오류:", error);
        });
}

// CSV 파일 데이터 파싱
function parseMH(csvText) {
    var lines = csvText.trim().split('\n');
    if (lines.length <= 1) return;

    for (var i = 1; i < lines.length; i++) {
        var line = lines[i].trim();
        if (!line) continue;

        var columns = line.split(',');

        var name = columns[0] ? columns[0].trim() : '';
        var lng = columns[1] ? parseFloat(columns[1].trim()) : 0; // 127.xxx
        var lat = columns[2] ? parseFloat(columns[2].trim()) : 0; // 37.xxx
        //var lat = columns[1] ? parseFloat(columns[1].trim()) : 0;
        //var lng = columns[2] ? parseFloat(columns[2].trim()) : 0;

        if (isNaN(lat) || isNaN(lng) || lat === 0 || lng === 0) continue;

        try {
            allMH.push({
                name: name,
                position: new kakao.maps.LatLng(lat, lng)
            });
        } catch (e) {
            console.error(i + "번째 행 맨홀 좌표 변환 실패:", e);
        }
    }
    //
    mhImageSrc = 'https://t1.daumcdn.net/localimg/localimages/07/mapapidoc/markerStar.png'; // 사용할 맨홀 이미지 경로
    mhImageSize = new kakao.maps.Size(24, 35);
    mhImageOption = { offset: new kakao.maps.Point(12, 35) };
    mhMarkerImage = new kakao.maps.MarkerImage(mhImageSrc, mhImageSize, mhImageOption);

    updateMH();
}

function updateMH() {
    clearMH();
    drawMH();
}

// 화면에 표출된 맨홀 마커 초기화
function clearMH() {
    for (var idx = 0; idx < overMH.length; idx++) {
        overMH[idx].setMap(null);
    }
    onMH = []; 
    overMH = [];
}

// 지도 범위 내 맨홀을 특정 이미지 마커로 그리기
/*function drawMH() {
    if (!map || allMH.length === 0) return;
    if (map.getLevel() >= 5) return;

    var mapBounds = map.getBounds();

    for (var i = 0; i < allMH.length; i++) {
        var mh = allMH[i];

        // 현재 지도 화면 영역 내에 맨홀 좌표가 포함되는지 확인
        if (mapBounds.contain(mh.position)) {
            console.log(mh.name)
            var marker = new kakao.maps.Marker({
                position: mh.position,
                image: mhMarkerImage,
                title: mh.name
            });
            
            marker.setMap(map);
            
            onMH.push(mh);
            overMH.push(marker);
        }
    }
}*/
// drawMH 함수
function drawMH() {
    if (!map || allMH.length === 0) return;
    if (map.getLevel() >= 5) return;

    var mapBounds = map.getBounds();

    for (var i = 0; i < allMH.length; i++) {
        var mh = allMH[i];

        if (mapBounds.contain(mh.position)) {
            // 이미지 + 이름 라벨을 포함하는 HTML 엘리먼트 생성
            var content = document.createElement('div');
            content.className = 'mh-overlay';
            content.innerHTML = 
                '<img src="' + mhImageSrc + '" alt="맨홀">' +
                '<div class="mh-label">' + (mh.name || '맨홀') + '</div>';

            // 커스텀 오버레이 생성
            var overlay = new kakao.maps.CustomOverlay({
                position: mh.position,
                content: content,
                xAnchor: 0.5, // 가로 중앙 정렬
                yAnchor: 0.5  // 세로 중앙 정렬
            });

            overlay.setMap(map);
            
            onMH.push(mh);
            overMH.push(overlay);
        }
    }
}

// 로드뷰 화면 내 맨홀 오버레이 초기화
function clearRvMH() {
    for (var i = 0; i < rvOverMH.length; i++) {
        rvOverMH[i].setMap(null);
    }
    rvOverMH = [];
}

/*function drawRvMH() {
    // 로드뷰 객체(roadview) 및 데이터 확인
    if (!roadView || allMH.length === 0) return;

    // 기존 로드뷰 오버레이 제거
    clearRvMH();

    for (var i = 0; i < allMH.length; i++) {
        var mh = allMH[i];

        // 1. 오버레이 HTML 엘리먼트 생성 (지도와 동일한 스타일 적용)
        var content = document.createElement('div');
        content.className = 'mh-overlay';
        content.innerHTML = 
            '<img src="' + mhImageSrc + '" alt="맨홀">' +
            '<div class="mh-label">' + (mh.name || '맨홀') + '</div>';

        // 2. 로드뷰용 커스텀 오버레이 생성
        var rvOverlay = new kakao.maps.CustomOverlay({
            position: mh.position,
            content: content,
            xAnchor: 0.5,
            yAnchor: 0.5
        });

        // 3. 지도(map) 대신 로드뷰(roadview)에 설정
        rvOverlay.setMap(roadView);

        // 오버레이 추적 배열에 저장
        rvOverMH.push(rvOverlay);
    }
}*/

// 로드뷰 화면 내 30m 이내 맨홀만 표시하는 함수
function drawRvMH() {
    if (!roadView || allMH.length === 0) return;

    // 기존 로드뷰 오버레이 제거
    clearRvMH();

    // 현재 로드뷰 중심 좌표 취득
    var rvPosition = roadView.getPosition();
    if (!rvPosition) return;

    for (var i = 0; i < allMH.length; i++) {
        var mh = allMH[i];

        // 로드뷰 위치와 맨홀 위치 간의 거리 계산 (단위: 미터)
        var polyline = new kakao.maps.Polyline({
            path: [rvPosition, mh.position]
        });
        var distance = polyline.getLength();

        // 30m 이내에 있는 맨홀만 커스텀 오버레이로 로드뷰에 표시
        if (distance <= 30) {
            var content = document.createElement('div');
            content.className = 'mh-overlay';
            content.innerHTML = 
                '<img src="' + mhImageSrc + '" alt="맨홀">' +
                '<div class="mh-label">' + (mh.name || '맨홀') + '</div>';

            var rvOverlay = new kakao.maps.CustomOverlay({
                position: mh.position,
                content: content,
                xAnchor: 0.5,
                yAnchor: 0.5
            });

            rvOverlay.setMap(roadView);
            rvOverMH.push(rvOverlay);
        }
    }
}

//카메라
var camMH = [];

function MHcamUpdate(event){
    //가짜 camPosition 만들기
    var tlat = 37.36990553273216;
    var tlng = 127.10843471960456;
    // GPS 수신 함수 대신 가짜 위치 전달
    CCPos = {lat: tlat, lng: tlng};

    //getCurrentLocation();// 현재 카메라 위치 
    if (CCPos == null) {
        console.log("현재 카메라 위치가 없습니다.");
        return;
    }
    
    // iPhone / iPad 계열
    if (event.webkitCompassHeading != null) heading = event.webkitCompassHeading;
    // Android 계열
    else if (event.alpha != null) heading = 360 - event.alpha;

    if (heading == null) return;
    heading = smoothCompassHeading(heading);

    //camPoints.push(getPointByDistance(lat, lng, 0, 3))// 북쪽 3m
    //camPoints.push(getPointByDistance(lat, lng, 0, 5))// 북쪽 5m
    // 프레임 지연으로 DOM 레이아웃 확정 보장
    requestAnimationFrame(function() {
        camSVG.replaceChildren();// 기존 점 삭제
        camMH = [];
        findNearbyMHPoints(); // 주변 배관 데이터 수집 실행 (p1, p2 세그먼트 등록)
        drawMHPoint();
    });
}
// 가짜 카메라 위치 주변의 일정 거리(예: 30m) 이내 맨홀 선별 함수
function findNearbyMHPoints() {
    if (!allMH || allMH.length === 0 || !CCPos) return;

    camMH = [];

    allMH.forEach(function(mh) {
        var distance = getDistanceMeter(CCPos.lat, CCPos.lng, mh.position.getLat(), mh.position.getLng());
        
        // 일정 거리(예: 30m) 이내에 있는 맨홀만 camMH 배열에 추가
        if (distance <= targetDistance) { // targetDistance = 30
            camMH.push({
                name: mh.name,
                position: mh.position,
                distance: distance
            });
        }
    });
}

// AR 카메라 화면 상에 맨홀 이미지 및 글자(이름) 표출 함수
function drawMHPoint() {
    if (!camSVG || camMH.length === 0) return;

    var rect = camSVG.getBoundingClientRect();
    var width = rect.width;
    var height = rect.height;
    if (width <= 0 || height <= 0) return;

    var centerX = width / 2;

    camMH.forEach(function(mh) {
        // 맨홀 지점의 화면 투영 좌표 산출 (깊이값은 0으로 전달)
        var proj = projectLatLngToScreen(mh.position, width, height, centerX, 0);

        // 시야 내에 들어오는 경우만 그리
        if (proj.visible) {
            var imgWidth = 24;
            var imgHeight = 24;

            // 1. 이미지 표출 (<image> 요소)
            var img = document.createElementNS("http://www.w3.org/2000/svg", "image");
            img.setAttributeNS("http://www.w3.org/1999/xlink", "href", mhImageSrc);
            img.setAttribute("x", (proj.x - imgWidth / 2).toFixed(1));
            img.setAttribute("y", (proj.y - imgHeight / 2).toFixed(1));
            img.setAttribute("width", imgWidth);
            img.setAttribute("height", imgHeight);
            camSVG.appendChild(img);

            // 2. 글자/텍스트 표출 (<text> 요소)
            var text = document.createElementNS("http://www.w3.org/2000/svg", "text");
            text.setAttribute("x", proj.x.toFixed(1));
            text.setAttribute("y", (proj.y + imgHeight / 2 + 12).toFixed(1)); // 이미지 아래쪽에 위치
            text.setAttribute("fill", "#ffffff");
            text.setAttribute("font-size", "11");
            text.setAttribute("font-weight", "bold");
            text.setAttribute("text-anchor", "middle"); // 중앙 정렬
            text.setAttribute("stroke", "#000000");     // 가독성을 위한 검은색 테두리
            text.setAttribute("stroke-width", "0.5");
            text.textContent = mh.name || '맨홀';

            camSVG.appendChild(text);
        }
    });
}