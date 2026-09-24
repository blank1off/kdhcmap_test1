var allPPgroup = []; 
var onPPgroup = [];

var allPoly = []; 
var idx_groups = [];
var visited = [];
var mapOverlays = [];
var infoWindow = null;

var threshold = 0.00005; // 좌표 비교 오차 범위 (약 1m 이내 접촉 여부)

var roadOverlays = [];
var targetAngle = 80;
var targetDistance = 30;

var validSegments = [];
var roadRect = null;
var roadWt = null;
var roadHt = null;

// CSV 파일 읽어오기
function loadPPgroup(filePath) {
    fetch(filePath)
        .then(function(response) {
            if (!response.ok) throw new Error("CSV 파일 로드 실패");
            return response.text();
        })
        .then(function(csvText) {
            allPPgroup = [];
            parsePPgroup(csvText);
        })
        .catch(function(error) {
            console.error("오류 발생:", error);
        });
}
// CSV 파일 데이터 파싱
function parsePPgroup(csvText) {
    var lines = csvText.trim().split('\n');
    if (lines.length <= 1) return;

    for (var i = 1; i < lines.length; i++) {
        var line = lines[i].trim();
        if (!line) continue;

        var coordStartIndex = line.indexOf('"[');
        var coordEndIndex = line.lastIndexOf(']"');

        if (coordStartIndex === -1 || coordEndIndex === -1) continue;

        var propertiesPart = line.substring(0, coordStartIndex);
        var columns = propertiesPart.split(',');

        var eqpId = columns[0] ? columns[0].trim() : '';
        var srCode = columns[1] ? columns[1].trim() : '';
        var cntrwkNm = columns[2] ? columns[2].replace(/^"|"$/g, '').trim() : '';
        var diaCode = parseInt(columns[3], 10) || 0;
        var pipePress = columns[4] ? columns[4].trim() : '';
        var plineLt = columns[5] ? columns[5].trim() : '';
        var competDe = columns[6] ? columns[6].trim() : '';
        var qltyGrade = columns[7] ? columns[7].trim() : '';
        var avgDph = columns[10] ? columns[10].trim() : '';

        var coordString = line.substring(coordStartIndex + 1, coordEndIndex + 1);

        try {
            var rawCoords = JSON.parse(coordString);
            var coords = [];
            var minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;

            for (var j = 0; j < rawCoords.length; j++) {
                var lng = parseFloat(rawCoords[j][0]);
                var lat = parseFloat(rawCoords[j][1]);
                coords.push(new kakao.maps.LatLng(lat, lng));

                if (lat < minLat) minLat = lat;
                if (lat > maxLat) maxLat = lat;
                if (lng < minLng) minLng = lng;
                if (lng > maxLng) maxLng = lng;
            }

            allPPgroup.push({
                eqpId: eqpId,
                srCode: srCode,
                diaCode: diaCode,
                cntrwkNm: cntrwkNm,
                pipePress: pipePress,
                plineLt: plineLt,
                competDe: competDe,
                qltyGrade: qltyGrade,
                avgDph: avgDph,
                coords: coords,
                bounds: new kakao.maps.LatLngBounds(
                    new kakao.maps.LatLng(minLat, minLng),
                    new kakao.maps.LatLng(maxLat, maxLng)
                )
            });

        } catch (e) {
            console.error(i + "번째 행 좌표 변환 실패:", e);
        }
    }
    updatePPgroup();
}
function updatePPgroup(){
    clearPPgroup();
    drawPPgroup();
    make_groups();
}

// 배관 관련 그래픽 요소를 화면에서 제거
function clearPPgroup() {
    if (infoWindow) infoWindow.close();
    for (var idx = 0; idx < mapOverlays.length; idx++) {
        mapOverlays[idx].setMap(null);
    }
    for (var idx = 0; idx < allPoly.length; idx++) {
        allPoly[idx].setMap(null);
    }
    onPPgroup = []; 

    allPoly = []; 
    idx_groups = [];
    visited = [];
    mapOverlays = [];
    infoWindow = null;
}

// 지도 레벨/영역 조건에 맞는 배관 선 그리기
function drawPPgroup() {
    if (!map || allPPgroup.length === 0) return;
    if (map.getLevel() >= 5) return;

    var mapBounds = map.getBounds();

    for (var i = 0; i < allPPgroup.length; i++) {
        var PPgroup = allPPgroup[i];

        if (mapBounds.intersects(PPgroup.bounds)) {
            var lineColor = '#FF0000';
            if (PPgroup.srCode === 'R') lineColor = '#FFA000';
            else if (PPgroup.srCode !== 'S') lineColor = '#888888';

            var poly = new kakao.maps.Polyline({
                path: PPgroup.coords,
                strokeWeight: 1,
                strokeColor: lineColor,
                strokeStyle: 'solid'
            });

            poly.setMap(map);
            allPoly.push(poly);
            onPPgroup.push(PPgroup);

            // 이벤트 리스너 등록 함수 호출
            addPPClickListener(poly, PPgroup);
        }
    }
}
// 배관 클릭 이벤트 전용 함수 (밖으로 분리)
function addPPClickListener(poly, PPgroup) {
    kakao.maps.event.addListener(poly, 'click', function(mouseEvent) {
        if (infoWindow) infoWindow.close();

        var srText = PPgroup.srCode === 'S' ? '공급관(S)' : (PPgroup.srCode === 'R' ? '회수관(R)' : '기타');

        var infoContent = 
            '<div style="padding:10px; font-size:12px; width:220px; line-height:1.6; color:#333;">' +
                '<div style="font-weight:bold; font-size:13px; border-bottom:2px solid #2b6cb0; padding-bottom:3px; margin-bottom:6px;">' +
                    '배관 상세 정보 (' + (PPgroup.eqpId || '-') + ')' +
                '</div>' +
                '<b>구분:</b> ' + srText + '-' + (PPgroup.pipePress || '-') + 'bar<br>' +
                '<b>관경:</b> ' + (PPgroup.diaCode || '-') + 'A<br>' +
                '<b>길이:</b> ' + (PPgroup.plineLt || '-') + ' m<br>' +
                '<b>심도:</b> ' + (PPgroup.avgDph || '-') + ' m<br>' +
                '<b>설치일:</b> ' + (PPgroup.competDe || '-') + '<br>' +
                '<b>공사명:</b> ' + (PPgroup.cntrwkNm || '-') +
            '</div>';

        infoWindow = new kakao.maps.InfoWindow({
            position: mouseEvent.latLng,
            content: infoContent,
            removable: true
        });

        infoWindow.open(map);
    });
}

// 그룹화 알고리즘 및 라벨 표출
function make_groups() {
    if (map.getLevel() >= 3) return;
    if (onPPgroup.length === 0) return;

    visited = new Array(onPPgroup.length).fill(false);
    
    for (var i = 0; i < onPPgroup.length; i++) {
        if (visited[i]) continue;

        var group = [];
        var queue = [i];
        visited[i] = true;

        while (queue.length > 0) {
            var curr = queue.shift();
            group.push(curr);

            for (var j = 0; j < onPPgroup.length; j++) {
                if (visited[j]) continue;

                if (isConnected(onPPgroup[curr], onPPgroup[j])) {
                    visited[j] = true;
                    queue.push(j);
                }
            }
        }
        idx_groups.push(group);
    }

    // 그룹 내 최장 배관을 선별해 오버레이 라벨 표출
    for (var g = 0; g < idx_groups.length; g++) {
        var groupIndices = idx_groups[g];

        var ttIndex = groupIndices.reduce(function(maxIdx, currIdx) {
            var maxLen = parseFloat(onPPgroup[maxIdx].plineLt) || 0;
            var currLen = parseFloat(onPPgroup[currIdx].plineLt) || 0;
            return currLen > maxLen ? currIdx : maxIdx;
        }, groupIndices[0]);

        var targetPipe = onPPgroup[ttIndex];
        //if (targetPipe.srCode === 'R') continue; //극단적
        //var midCoordIndex = Math.floor(targetPipe.path.length / 2);
        var midCoordIndex = Math.ceil(targetPipe.coords.length / 2);
        if (targetPipe.srCode === 'R' && midCoordIndex >= 1) midCoordIndex -= 1;
        var centerPosition = targetPipe.coords[midCoordIndex];

        var overlay = null;
        if (targetPipe.srCode === 'S'){
            var overlayContent = '<div class="pipe-s-label">' + targetPipe.diaCode + 'A</div>';
            overlay = new kakao.maps.CustomOverlay({
                position: centerPosition,
                content: overlayContent,
                xAnchor: 0.5,
                yAnchor: 0.9
            });
        }
        if (targetPipe.srCode === 'R'){
            var overlayContent = '<div class="pipe-r-label">' + targetPipe.diaCode + 'A</div>';
            overlay = new kakao.maps.CustomOverlay({
                position: centerPosition,
                content: overlayContent,
                xAnchor: 0.5,
                yAnchor: 0.1
            });
        }

        overlay.setMap(map);
        mapOverlays.push(overlay);
    }
}

// 배관 연결성 검사 보조 함수
function isConnected(pipeA, pipeB) {
    if (pipeA.diaCode !== pipeB.diaCode) return false;
    if (pipeA.srCode !== pipeB.srCode) return false;

    var p1_start = pipeA.coords[0];
    var p1_end = pipeA.coords[pipeA.coords.length - 1];
    var p2_start = pipeB.coords[0];
    var p2_end = pipeB.coords[pipeB.coords.length - 1];

    return gap_checker(p1_start, p2_start) || gap_checker(p1_start, p2_end) ||
        gap_checker(p1_end, p2_start) || gap_checker(p1_end, p2_end);
}
function gap_checker(pt1, pt2) {
    var dLat = Math.abs(pt1.getLat() - pt2.getLat());
    var dLng = Math.abs(pt1.getLng() - pt2.getLng());
    return (dLat < threshold && dLng < threshold);
}

//로드뷰
// 로드뷰 오버레이 전체 삭제 함수
function clearRoadOverlays() {
    if (roadUpdateTimer !== null) clearTimeout(roadUpdateTimer);
    roadUpdateTimer = null;

    if (roadSVG) roadSVG.replaceChildren();
    if (roadSVG) roadSVG.innerHTML = '';

    for (var i = 0; i < roadOverlays.length; i++) {
        roadOverlays[i].setMap(null);
    }
    roadOverlays = [];
}
// 오버레이 생성 후 객체/DOM 참조 반환
function createPointOverlay(point, pipeIdx, pointIdx, pipe) {
    var labelClass = pipe.srCode === 'S' ? 'road-s-point' : 'road-r-point';

    // 1. 문자열 대신 DOM 엘리먼트 생성
    var element = document.createElement('div');
    element.className = 'road-point-overlay ' + labelClass;
    element.setAttribute('data-pipe', pipeIdx);
    element.setAttribute('data-idx', pointIdx);       
    element.innerHTML = (pipe.diaCode || '') + 'A';

    // 2. CustomOverlay에 DOM 엘리먼트 전달
    var customOverlay = new kakao.maps.CustomOverlay({
        position: point,
        content: element, // DOM Element 전달
        xAnchor: 0.5,
        yAnchor: 0.5
    });    

    customOverlay.setMap(roadView);
    roadOverlays.push(customOverlay);

    return element
}

function PPGroadUpdate() {
    clearRoadOverlays();
    validSegments = [];

    var position = roadView.getPosition(); 
    if (!position) return;
    var cLat = position.getLat();
    var cLng = position.getLng();
    console.log(cLat)
    console.log(cLng)

    var viewpoint = roadView.getViewpoint();
    if (!viewpoint) return;
    var cPan = (viewpoint.pan % 360 + 360) % 360;

    allPPgroup.forEach(function(PPG, pipeIdx) {
        if (!PPG.coords || PPG.coords.length < 2) return;

        for (var i = 0; i < PPG.coords.length - 1; i++) {
            var path1 = PPG.coords[i];
            var path2 = PPG.coords[i + 1];

            var closestPt = getClosestPointOnSegment(
                cLat, cLng,
                path1.getLat(), path1.getLng(),
                path2.getLat(), path2.getLng()
            );

            var distance = getDistanceMeter(cLat, cLng, closestPt.lat, closestPt.lng);
            if (distance > targetDistance) continue;
        
            var element1 = createPointOverlay(path1, pipeIdx, i, PPG);
            var element2 = createPointOverlay(path2, pipeIdx, i + 1, PPG);

            var pipeColor = '#888888';
            if (PPG.srCode === 'S') pipeColor = '#FF0000';
            if (PPG.srCode === 'R') pipeColor = '#FFA000';

            validSegments.push({
                el1: element1,
                el2: element2,
                path1: path1,
                path2: path2,
                inner1: false,
                inner2: false,
                x1:0,y1:0,x2:0,y2:0,
                color: pipeColor,
            });
        }
    });

    // 프레임 지연으로 DOM 레이아웃 확정 보장
    requestAnimationFrame(function() {
        drawSvgFromSegments();
    });
}

function drawSvgFromSegments() {
    if (!roadSVG || !validSegments) return;
    roadRect = roadSVG.getBoundingClientRect();
    roadWt = roadRect.width;
    roadHt = roadRect.height;
    if (roadWt <= 0 || roadHt <= 0) return;
    roadSVG.setAttribute('width', roadWt);
    roadSVG.setAttribute('height', roadHt);
    roadSVG.setAttribute('viewBox', '0 0 ' + roadWt + ' ' + roadHt);

    validSegments.forEach(function(seg) {
        isVisiblePoint(seg);
        if (seg.inner1 && seg.inner2) 
            lineDraw(seg.x1, seg.y1, seg.x2, seg.y2, seg.color);
        if (seg.inner1 && !seg.inner2){
            var tempPoint = findVisibleTempPoint(seg.path1,seg.path2,seg.pipeIdx)

            if (tempPoint) {// path1 → 임시점 방향
                var dx = tempPoint.x - seg.x1;
                var dy = tempPoint.y - seg.y1;

                var end = extendToScreenEdge(seg.x1, seg.y1, dx, dy);

                lineDraw(seg.x1, seg.y1, end.x, end.y, seg.color);
            }
            
        }
        if (!seg.inner1 && seg.inner2){
            var tempPoint = findVisibleTempPoint(seg.path2,seg.path1,seg.pipeIdx)

            if (tempPoint) {// path1 → 임시점 방향
                var dx = tempPoint.x - seg.x2;
                var dy = tempPoint.y - seg.y2;

                var end = extendToScreenEdge(seg.x2, seg.y2, dx, dy);

                lineDraw(seg.x2, seg.y2, end.x, end.y, seg.color);
            }
        }
        if (!seg.inner1 && !seg.inner2) {

            var tempPoints = findVisibleTempPoint2(seg.path1,seg.path2,seg.pipeIdx);
            if (tempPoints.point1 && tempPoints.point2) {
                var dx = tempPoints.point1.x - tempPoints.point2.x;
                var dy = tempPoints.point1.y - tempPoints.point2.y;
                var end1 = extendToScreenEdge(tempPoints.point1.x, tempPoints.point1.y, dx, dy);
                var end2 = extendToScreenEdge(tempPoints.point2.x, tempPoints.point2.y, -dx, -dy);

                lineDraw(end1.x, end1.y, end2.x, end2.y, seg.color);
            }
        }
    });
}

function isVisiblePoint(seg) {
    if (!seg) return;
    var margin = 1;// 화면 안쪽에 있는지 검사시 여유값

    var rect1 = seg.el1.getBoundingClientRect()
    if (rect1.width === 0 && rect1.height === 0) 
        seg.inner1 = false;//아직 DOM 배치가 안 되었거나 크기가 0이면 오버레이 안보임
    else{
        seg.x1 = rect1.left + rect1.width / 2 - roadRect.left;
        seg.y1 = rect1.top + rect1.height / 2 - roadRect.top;

        if (seg.x1 >= -margin && seg.x1 <= roadWt + margin &&
            seg.y1 >= -margin && seg.y1 <= roadHt + margin) 
            seg.inner1 = true;
    }

    var rect2 = seg.el2.getBoundingClientRect()
    if (rect2.width === 0 && rect2.height === 0)
        seg.inner2 = false;//아직 DOM 배치가 안 되었거나 크기가 0이면 오버레이 안보임
    else{
        seg.x2 = rect2.left + rect2.width / 2 - roadRect.left;
        seg.y2 = rect2.top + rect2.height / 2 - roadRect.top;

        if (seg.x2 >= -margin && seg.x2 <= roadWt + margin &&
            seg.y2 >= -margin && seg.y2 <= roadHt + margin) 
            seg.inner2 = true;
    }
}

function lineDraw(x1, y1, x2, y2, color){
    var line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', x1.toFixed(1));
    line.setAttribute('y1', y1.toFixed(1));
    line.setAttribute('x2', x2.toFixed(1));
    line.setAttribute('y2', y2.toFixed(1));
    line.setAttribute('stroke', color);
    line.setAttribute('stroke-width', '3');
    line.setAttribute('opacity', '0.85');
    roadSVG.appendChild(line);
}

function getPointAtRatio(path1, path2, ratio) {
    var lat1 = path1.getLat();
    var lng1 = path1.getLng();

    var lat2 = path2.getLat();
    var lng2 = path2.getLng();

    var lat = lat1 + (lat2 - lat1) * ratio;
    var lng = lng1 + (lng2 - lng1) * ratio;

    return new kakao.maps.LatLng(lat, lng);
}
function findVisibleTempPoint(path1, path2, pipeIdx) {
    var ratios = [0.8,0.5,0.2,0.05];

    for (var i = 0; i < ratios.length; i++) {
        var point = getPointAtRatio(path1,path2,ratios[i]);

        var tempElement = createPointOverlay(point,pipeIdx,-1,{ srCode: 'TEMP' });
        var rect = tempElement.getBoundingClientRect();
        var tx = rect.left + rect.width / 2 - roadRect.left;
        var ty = rect.top + rect.height / 2 - roadRect.top;

        var visible =
            rect.width > 0 &&
            rect.height > 0 &&
            tx >= 0 &&
            tx <= roadWt &&
            ty >= 0 &&
            ty <= roadHt;

        tempElement.remove();

        if (visible) return {point: point, x: tx, y: ty};
    }

    return null;
}
function findVisibleTempPoint2(path1, path2, pipeIdx) {
    var ratios1 = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
    var ratios2 = [0.05, 0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85];
    var visiblePoint1 = null;
    var visiblePoint2 = null;

    for (var i = 0; i < ratios1.length; i++) {
        var point = getPointAtRatio(path1,path2,ratios1[i]);
        var tempElement = createPointOverlay(point,pipeIdx,-1,{ srCode: 'TEMP' });
        var rect = tempElement.getBoundingClientRect();
        var tx = rect.left + rect.width / 2 - roadRect.left;
        var ty = rect.top + rect.height / 2 - roadRect.top;

        var visible =
            rect.width > 0 &&
            rect.height > 0 &&
            tx >= 0 &&
            tx <= roadWt &&
            ty >= 0 &&
            ty <= roadHt;
        
        if (visible){
            visiblePoint1 = {point: point,x: tx,y: ty};
            console.log(visiblePoint1)
            break;
        }
        else tempElement.remove();
    }
    for (var i = 0; i < ratios2.length; i++) {
        var point = getPointAtRatio(path2,path1,ratios2[i]);
        var tempElement = createPointOverlay(point,pipeIdx,-1,{ srCode: 'TEMP' });
        var rect = tempElement.getBoundingClientRect();
        var tx = rect.left + rect.width / 2 - roadRect.left;
        var ty = rect.top + rect.height / 2 - roadRect.top;

        var visible =
            rect.width > 0 &&
            rect.height > 0 &&
            tx >= 0 &&
            tx <= roadWt &&
            ty >= 0 &&
            ty <= roadHt;
        
        if (visible){
            visiblePoint2 = {point: point,x: tx,y: ty};
            console.log(visiblePoint2)
            break;
        }
        else tempElement.remove();
    }

    return {
        point1: visiblePoint1,
        point2: visiblePoint2
    };
}

function extendToScreenEdge(x1, y1, dx, dy) {
    var candidates = [];
    
    //방향 벡터가 0이면 연장할 수 없다.
    var length = Math.sqrt(dx * dx + dy * dy);
    if (length < 0.000001) return {x: x1, y: y1};

    //방향 벡터 정규화
    dx /= length;
    dy /= length;

    //오른쪽 경계 x = roadWt
    if (dx > 0) {
        var tRight = (roadWt - x1) / dx;
        if (tRight >= 0) {
            var yRight = y1 + dy * tRight;
            if (yRight >= 0 && yRight <= roadHt) {
                candidates.push({t: tRight,x: roadWt,y: yRight});
            }
        }
    }
    //왼쪽 경계 x = 0
    if (dx < 0) {
        var tLeft = (0 - x1) / dx;
        if (tLeft >= 0) {
            var yLeft = y1 + dy * tLeft;
            if (yLeft >= 0 && yLeft <= roadHt) {
                candidates.push({t: tLeft,x: 0,y: yLeft});
            }
        }
    }
    //아래쪽 경계 y = roadHt
    if (dy > 0) {
        var tBottom = (roadHt - y1) / dy;
        if (tBottom >= 0) {
            var xBottom = x1 + dx * tBottom;;
            if (xBottom >= 0 && xBottom <= roadWt) {
                candidates.push({t: tBottom,x: xBottom,y: roadHt});
            }
        }
    }
    //위쪽 경계 y = 0
    if (dy < 0) {
        var tTop = (0 - y1) / dy;
        if (tTop >= 0) {
            var xTop = x1 + dx * tTop;
            if (xTop >= 0 && xTop <= roadWt) {
                candidates.push({t: tTop,x: xTop,y: 0});
            }
        }
    }

    // 가장 먼 교차점을 선택한다.
    // 현재 점에서 화면 바깥쪽으로
    // 최대한 길게 선을 그린다.

    if (candidates.length === 0) return {x: x1, y: y1};

    candidates.sort(function(a, b) { return b.t - a.t; });

    return {x: candidates[0].x, y: candidates[0].y};
}

//카메라
var CCPos = null;
var CAMERA_FOV = 60;
var CAMERA_MAX_DISTANCE = 10;
var camPoints = [];
var heading = null;
var smoothHeading = null; // ★ 이 위치에 변수 선언을 추가합니다.
var CAMERA_FOV_X = 60; // 가로 FOV
var CAMERA_HEIGHT = 1.5; // 스마트폰을 들고 있는 높이 (지면으로부터 약 1.5m)
var devicePitch = 0; // 카메라 상하 기울기 (기본값 0: 정면 주시)
var HEADING_THRESHOLD = 3.0; // 3도 이상 변경 시에만 렌더링
var POSITION_THRESHOLD = 0.8; // 0.8m 이상 이동 시에만 렌더링
// 센서 임계값 및 이전 상태 저장 변수
var lastRenderHeading = null;
var lastRenderPos = null;

function PPGcamUpdate(event){
    

    //가짜 camPosition 만들기
    var tlat = 37.369932982787454;
    var tlng = 127.10797640931209;
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
        camPoints = [];
        findNearbyPipePoints(); // 주변 배관 데이터 수집 실행 (p1, p2 세그먼트 등록)
        drawProjectedPoint();
    });
}

/*function PPGcamUpdate(event) {
    // 1. 가짜 camPosition 설정 (또는 실제 GPS 위치)
    var tlat = 37.369932982787454;
    var tlng = 127.10797640931209;
    CCPos = { lat: tlat, lng: tlng };

    if (CCPos == null) return;

    // 2. heading 추출
    var rawHeading = null;
    if (event.webkitCompassHeading != null) rawHeading = event.webkitCompassHeading;
    else if (event.alpha != null) rawHeading = 360 - event.alpha;

    if (rawHeading == null) return;

    // 3. 부드러운 회전 적용 (스무딩)
    heading = smoothCompassHeading(rawHeading);

    // 4. 변화량 검사 (임계값 체크)
    if (!shouldRedraw(heading, CCPos)) {
        return; // 변화량이 작으면 그리지 않고 이전 화면 유지!
    }

    // 5. 임계값을 넘었을 때만 이전 좌표 기록 update & SVG 재렌더링
    lastRenderHeading = heading;
    lastRenderPos = { lat: CCPos.lat, lng: CCPos.lng };

    // 디바운스 타이머 설정 (요청 간격 조절)
    if (camUpdateTimer) clearTimeout(camUpdateTimer);
    camUpdateTimer = setTimeout(function() {
        if (camSVG) camSVG.replaceChildren(); // 실제 그릴 때만 초기화
        
        findNearbyPipePoints();
        requestAnimationFrame(function() {drawProjectedPoint();});
    }, 30); // 30ms 디바운스
}*/
/*function testCamPoint(svg, distance) {
    var rect = svg.getBoundingClientRect();

    var width = rect.width;
    var height = rect.height;

    var cx = width / 2;
    var cy = height / 2;

    // 테스트용:
    // 일단 북쪽 점을 화면 중앙에 표시
    var x = cx;
    var y = cy;

    var circle = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "circle"
    );

    circle.setAttribute("cx", x);
    circle.setAttribute("cy", y);
    circle.setAttribute("r", 10);

    circle.setAttribute("data-distance",distance);
    svg.appendChild(circle);
}*/

// 렌더링 필요 여부 판단 함수
function shouldRedraw(currentHeading, currentPos) {
    // 최초 실행 시 무조건 그림
    if (lastRenderHeading === null || lastRenderPos === null) return true;

    // 1. 각도 변화량 계산
    var angleDiff = Math.abs(currentHeading - lastRenderHeading);
    if (angleDiff > 180) angleDiff = 360 - angleDiff;

    if (angleDiff >= HEADING_THRESHOLD) return true;

    // 2. 위치 변화량 계산
    var distDiff = getDistanceMeter(
        lastRenderPos.lat, lastRenderPos.lng,
        currentPos.lat, currentPos.lng
    );

    if (distDiff >= POSITION_THRESHOLD) return true;

    return false; // 변화가 임계값 미만이면 재그리기 건너뜀
}
function smoothCompassHeading(newHeading) {
    if (smoothHeading == null) {
        smoothHeading = newHeading;
        return smoothHeading;
    }

    var diff = newHeading - smoothHeading;
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;

    smoothHeading += diff * 0.1;
    if (smoothHeading < 0) smoothHeading += 360;
    if (smoothHeading >= 360) smoothHeading -= 360;

    return smoothHeading;
}
function getPointByDistance(lat, lng, bearing, distance) {

    var R = 6371000;

    var radLat = lat * Math.PI / 180;
    var radLng = lng * Math.PI / 180;
    var radBearing = bearing * Math.PI / 180;

    var angularDistance = distance / R;

    var newLat = Math.asin(
        Math.sin(radLat) * Math.cos(angularDistance) +
        Math.cos(radLat) * Math.sin(angularDistance) *
        Math.cos(radBearing)
    );

    var newLng = radLng + Math.atan2(
        Math.sin(radBearing) * Math.sin(angularDistance) * Math.cos(radLat),
        Math.cos(angularDistance) -
        Math.sin(radLat) * Math.sin(newLat)
    );

    return new kakao.maps.LatLng(
        newLat * 180 / Math.PI,
        newLng * 180 / Math.PI
    );
}
// 현재 위치 가져오기
function getCurrentLocation() {
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
}

/*function drawProjectedPoint() {
    var rect = camSVG.getBoundingClientRect();
    var width = rect.width;
    var height = rect.height;
    var centerX = width / 2;
    var centerY = height / 2;

    for (var i = 0; i < camPoints.length; i++) {
        var point = camPoints[i];

        // 카메라 → 점의 방위각
        var bearing = getBearing(camPosition.lat,camPosition.lng,point.getLat(),point.getLng());
        // 카메라 정면 기준 상대각
        var relativeAngle = bearing - heading;
        while (relativeAngle > 180) {relativeAngle -= 360;}
        while (relativeAngle < -180) {relativeAngle += 360;}

        // 카메라 FOV 밖
        if (relativeAngle < -CAMERA_FOV / 2 || relativeAngle > CAMERA_FOV / 2) return;

        var x = centerX + (relativeAngle / (CAMERA_FOV / 2)) * centerX; // X : 방위각

        var distanceRatio = Math.min(distance / CAMERA_MAX_DISTANCE, 1); // Y : 거리

        var y = height * 0.8 - distanceRatio * height * 0.6;

        // 점 그리기
        var circle = document.createElementNS("http://www.w3.org/2000/svg","circle");
        circle.setAttribute("cx", x);
        circle.setAttribute("cy", y);
        circle.setAttribute("r", 10);

        camSVG.appendChild(circle);
    }
}*/
// 가짜 카메라 위치 주변의 배관 세그먼트 및 점 선별 함수
function findNearbyPipePoints() {
    if (!allPPgroup || allPPgroup.length === 0) return;

    allPPgroup.forEach(function(PPG, pipeIdx) { // pipeIdx 추가
        if (!PPG.coords || PPG.coords.length < 2) return;

        for (var i = 0; i < PPG.coords.length - 1; i++) {
            var path1 = PPG.coords[i];
            var path2 = PPG.coords[i + 1];

            var dist1 = getDistanceMeter(CCPos.lat, CCPos.lng, path1.getLat(), path1.getLng());
            var dist2 = getDistanceMeter(CCPos.lat, CCPos.lng, path2.getLat(), path2.getLng());

            if (dist1 <= targetDistance || dist2 <= targetDistance) {
                var pipeColor = '#888888';
                if (PPG.srCode === 'S') pipeColor = '#FF0000';
                if (PPG.srCode === 'R') pipeColor = '#FFA000';

                camPoints.push({
                    pipeIdx: pipeIdx,       // 배관 객체 인덱스
                    pointIdx: i,            // 배관 내 세그먼트 시작점 인덱스
                    p1: path1,
                    p2: path2,
                    color: pipeColor,
                    diaCode: PPG.diaCode,
                    srCode: PPG.srCode
                });
            }
        }
    });
}

/*// 투영된 화면 좌표 계산 및 점/선 그리기
function drawProjectedPoint() {
    var rect = camSVG.getBoundingClientRect();
    var width = rect.width;
    var height = rect.height;
    var centerX = width / 2;

    camPoints.forEach(function(segment) {
        // 경로 상의 점 1과 점 2 화면 좌표 계산
        var pt1 = projectLatLngToScreen(segment.p1, width, height, centerX);
        var pt2 = projectLatLngToScreen(segment.p2, width, height, centerX);

        // 1. 점 2개가 모두 화면 시야 내에 있는 경우 선 그리기
        if (pt1.visible && pt2.visible) {
            var line = document.createElementNS("http://www.w3.org/2000/svg", "line");
            line.setAttribute("x1", pt1.x.toFixed(1));
            line.setAttribute("y1", pt1.y.toFixed(1));
            line.setAttribute("x2", pt2.x.toFixed(1));
            line.setAttribute("y2", pt2.y.toFixed(1));
            line.setAttribute("stroke", segment.color);
            line.setAttribute("stroke-width", "3");
            line.setAttribute("opacity", "0.85");
            camSVG.appendChild(line);
        }

        // 2. 시야 내 점 표시 (원 생성)
        if (pt1.visible) drawCamCircle(pt1.x, pt1.y, segment.color);
        if (pt2.visible) drawCamCircle(pt2.x, pt2.y, segment.color);
    });
}*/

// 위경도를 화면 (X, Y) 좌표로 변환하는 보조 함수
/*function projectLatLngToScreen(latLng, width, height, centerX) {
    var lat = latLng.getLat();
    var lng = latLng.getLng();

    var distance = getDistanceMeter(CCPos.lat, CCPos.lng, lat, lng);
    var bearing = getBearing(CCPos.lat, CCPos.lng, lat, lng);

    var relativeAngle = bearing - heading;
    while (relativeAngle > 180) { relativeAngle -= 360; }
    while (relativeAngle < -180) { relativeAngle += 360; }

    // 시야각(CAMERA_FOV) 벗어난 경우 제외
    if (relativeAngle < -CAMERA_FOV / 2 || relativeAngle > CAMERA_FOV / 2 || distance > targetDistance) {
        return { visible: false };
    }

    // X, Y 투영 좌표계 산출
    var x = centerX + (relativeAngle / (CAMERA_FOV / 2)) * centerX;
    var distanceRatio = Math.min(distance / targetDistance, 1);
    var y = height * 0.8 - distanceRatio * height * 0.6;

    return { visible: true, x: x, y: y };
}*/
// 투영 좌표 계산 함수 개선
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

// 카메라 AR 화면 투영 및 4가지 조건별 그리기
function drawProjectedPoint() {
    var rect = camSVG.getBoundingClientRect();
    var width = rect.width;
    var height = rect.height;
    if (width <= 0 || height <= 0) return;

    var centerX = width / 2;

    camPoints.forEach(function(segment) {
        // 1. 카메라 위치(CCPos)와 선분(p1~p2) 사이의 최소 거리가 범위(targetDistance) 이내인지 검사
        var closestPt = getClosestPointOnSegment(
            CCPos.lat, CCPos.lng,
            segment.p1.getLat(), segment.p1.getLng(),
            segment.p2.getLat(), segment.p2.getLng()
        );
        var minDistance = getDistanceMeter(CCPos.lat, CCPos.lng, closestPt.lat, closestPt.lng);
        
        // 최소 거리가 범위를 초과하면 패스
        if (minDistance > targetDistance) return;

        // 투영 좌표 및 화면 내 존재 여부(visible) 계산
        var pt1 = projectLatLngToScreen(segment.p1, width, height, centerX, segment.avgDph);
        var pt2 = projectLatLngToScreen(segment.p2, width, height, centerX, segment.avgDph);
        //var pt1 = projectLatLngToScreen(segment.p1, width, height, centerX);
        //var pt2 = projectLatLngToScreen(segment.p2, width, height, centerX);

        // ----------------------------------------------------
        // 조건 2: 두 점이 모두 화면 내에 있는 경우
        // ----------------------------------------------------
        if (pt1.visible && pt2.visible) {
            lineDrawCam(pt1.x, pt1.y, pt2.x, pt2.y, segment.color);
            drawCamCircle(pt1.x, pt1.y, segment.color);
            drawCamCircle(pt2.x, pt2.y, segment.color);
        }
        // ----------------------------------------------------
        // 조건 3-1: p1만 화면 내에 있고, p2는 바깥인 경우
        // ----------------------------------------------------
        else if (pt1.visible && !pt2.visible) {
            drawCamCircle(pt1.x, pt1.y, segment.color);
            
            // p1 -> p2 방향으로 가상점 탐색 후 화면 경계까지 연장
            var tempPt = findCamTempPoint(segment.p1, segment.p2, width, height, centerX);
            if (tempPt) {
                var dx = tempPt.x - pt1.x;
                var dy = tempPt.y - pt1.y;
                var edge = extendCamToEdge(pt1.x, pt1.y, dx, dy, width, height);
                lineDrawCam(pt1.x, pt1.y, edge.x, edge.y, segment.color);
            }
        }
        // ----------------------------------------------------
        // 조건 3-2: p2만 화면 내에 있고, p1은 바깥인 경우
        // ----------------------------------------------------
        else if (!pt1.visible && pt2.visible) {
            drawCamCircle(pt2.x, pt2.y, segment.color);

            // p2 -> p1 방향으로 가상점 탐색 후 화면 경계까지 연장
            var tempPt = findCamTempPoint(segment.p2, segment.p1, width, height, centerX);
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
            var tempPair = findCamTempPointPair(segment.p1, segment.p2, width, height, centerX);
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
function findCamTempPointPair(p1, p2, width, height, centerX) {
    var ratios = [0.1, 0.3, 0.5, 0.7, 0.9];
    var v1 = null, v2 = null;

    for (var i = 0; i < ratios.length; i++) {
        var point1 = getPointAtRatio(p1, p2, ratios[i]);
        var proj1 = projectLatLngToScreen(point1, width, height, centerX);
        if (proj1.visible) {
            v1 = { x: proj1.x, y: proj1.y };
            break;
        }
    }

    for (var i = 0; i < ratios.length; i++) {
        var point2 = getPointAtRatio(p2, p1, ratios[i]);
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