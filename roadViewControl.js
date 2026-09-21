var roadUpdateTimer = null;
var roadOverlays = [];

var targetAngle = 80;
var targetDistance = 30;

var validSegments = [];
var svgRect = null;
var width = null;
var height = null;

var position = null;
var cLat = null;
var cLng = null;
var viewpoint = null;
var cPan = null;

function openRoadview(position) {
    document.getElementById('map').style.display = 'none';
    document.getElementById("camera").style.display = 'none';
    document.getElementById('road').style.display = 'block';

    document.getElementById('normalBtn').style.display = 'none';
    document.getElementById('skyviewBtn').style.display = 'none';
    document.getElementById('modeRoadBtn').style.display = 'none';
    document.getElementById('closeRoadBtn').style.display = 'block';
    document.getElementById('myLocationBtn').style.display = 'none';
    document.getElementById('openCameraBtn').style.display = 'none';
    document.getElementById('closeCameraBtn').style.display = 'none';

    road.relayout();// 지도의 크기를 변경하거나 숨김 상태에서 보인 직후에 호출

    // 특정 위치의 좌표와 가까운 로드뷰의 panoId를 추출하여 로드뷰를 띄운다.
    roadClient.getNearestPanoId(position, 50, function(panoId) {
        if (panoId === null) {
            alert('이 위치 주변에는 로드뷰를 지원하지 않습니다.');  
            closeRoadview();
            return;
        }
        road.setPanoId(panoId, position);
    });
}

function closeRoadview() {
    clearRoadOverlays(); // 로드뷰 닫을 때 오버레이 제거

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

    map.relayout();// 지도의 크기를 변경하거나 숨김 상태에서 보인 직후에 호출
}

// 로드뷰 오버레이 전체 삭제 함수
function clearRoadOverlays() {
    if (roadUpdateTimer !== null) clearTimeout(roadUpdateTimer);
    roadUpdateTimer = null;

    if (svg) svg.replaceChildren();
    if (svg) svg.innerHTML = '';

    for (var i = 0; i < roadOverlays.length; i++) {
        roadOverlays[i].setMap(null);
    }
    roadOverlays = [];
}

// 연속 이벤트를 하나로 묶어주는 디바운스 함수
//로드뷰를 열면 roadUpdate 3번 발생
//로드 이동하면 roadUpdate 2번 발생
function roadEvent() {
    if (svg) svg.replaceChildren();//줌 회전시 선 안보임
    if (roadUpdateTimer) clearTimeout(roadUpdateTimer);
    // 50ms 이내 연달아 들어오는 이벤트 중 마지막 1회만 실행
    roadUpdateTimer = setTimeout(function() {roadUpdate();}, 50); 
}

function roadUpdate() {
    clearRoadOverlays();
    validSegments = [];

    position = road.getPosition(); 
    if (!position) return;
    cLat = position.getLat();
    cLng = position.getLng();

    viewpoint = road.getViewpoint();
    if (!viewpoint) return;
    cPan = (viewpoint.pan % 360 + 360) % 360;

    Pipes_data.forEach(function(pipe, pipeIdx) {
        if (!pipe.path || pipe.path.length < 2) return;

        for (var i = 0; i < pipe.path.length - 1; i++) {
            var path1 = pipe.path[i];
            var path2 = pipe.path[i + 1];

            var closestPt = getClosestPointOnSegment(
                cLat, cLng,
                path1.getLat(), path1.getLng(),
                path2.getLat(), path2.getLng()
            );

            var distance = getDistanceMeter(cLat, cLng, closestPt.lat, closestPt.lng);
            if (distance > targetDistance) continue;
        
            var element1 = createPointOverlay(path1, pipeIdx, i, pipe);
            var element2 = createPointOverlay(path2, pipeIdx, i + 1, pipe);

            validSegments.push({
                el1: element1,
                el2: element2,
                path1: path1,
                path2: path2,
                inner1: false,
                inner2: false,
                x1:0,y1:0,x2:0,y2:0,
                color: getPipeColor(pipe)
            });
        }
    });
    
    // 프레임 지연으로 DOM 레이아웃 확정 보장
    requestAnimationFrame(function() {
        drawSvgFromSegments();
    });
}

// 점 P(lat, lng)에서 선분 AB(aLat, aLng ~ bLat, bLng)까지의 최단 좌표 H 구하기
function getClosestPointOnSegment(pLat, pLng, aLat, aLng, bLat, bLng) {
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

    customOverlay.setMap(road);
    roadOverlays.push(customOverlay);

    return element
}
function getPipeColor(pipe) {
    if (pipe.srCode === 'S') return '#FF0000';
    if (pipe.srCode === 'R') return '#FFA000';
    return '#888888';
}

function drawSvgFromSegments() {
    if (!svg || !validSegments) return;
    svgRect = svg.getBoundingClientRect();
    width = svgRect.width;
    height = svgRect.height;
    if (width <= 0 || height <= 0) return;
    svg.setAttribute('width', width);
    svg.setAttribute('height', height);
    svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);

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
        seg.x1 = rect1.left + rect1.width / 2 - svgRect.left;
        seg.y1 = rect1.top + rect1.height / 2 - svgRect.top;

        if (seg.x1 >= -margin && seg.x1 <= width + margin &&
            seg.y1 >= -margin && seg.y1 <= height + margin) 
            seg.inner1 = true;
    }

    var rect2 = seg.el2.getBoundingClientRect()
    if (rect2.width === 0 && rect2.height === 0)
        seg.inner2 = false;//아직 DOM 배치가 안 되었거나 크기가 0이면 오버레이 안보임
    else{
        seg.x2 = rect2.left + rect2.width / 2 - svgRect.left;
        seg.y2 = rect2.top + rect2.height / 2 - svgRect.top;

        if (seg.x2 >= -margin && seg.x2 <= width + margin &&
            seg.y2 >= -margin && seg.y2 <= height + margin) 
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
    svg.appendChild(line);
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
        var tx = rect.left + rect.width / 2 - svgRect.left;
        var ty = rect.top + rect.height / 2 - svgRect.top;

        var visible =
            rect.width > 0 &&
            rect.height > 0 &&
            tx >= 0 &&
            tx <= width &&
            ty >= 0 &&
            ty <= height;

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
        var tx = rect.left + rect.width / 2 - svgRect.left;
        var ty = rect.top + rect.height / 2 - svgRect.top;

        var visible =
            rect.width > 0 &&
            rect.height > 0 &&
            tx >= 0 &&
            tx <= width &&
            ty >= 0 &&
            ty <= height;
        
        if (visible){
            visiblePoint1 = {point: point,x: tx,y: ty};
            console.log(visiblePoint1)
            tempElement.remove();
            break;
        }
        else tempElement.remove();
    }
    for (var i = 0; i < ratios2.length; i++) {
        var point = getPointAtRatio(path2,path1,ratios2[i]);
        var tempElement = createPointOverlay(point,pipeIdx,-1,{ srCode: 'TEMP' });
        var rect = tempElement.getBoundingClientRect();
        var tx = rect.left + rect.width / 2 - svgRect.left;
        var ty = rect.top + rect.height / 2 - svgRect.top;

        var visible =
            rect.width > 0 &&
            rect.height > 0 &&
            tx >= 0 &&
            tx <= width &&
            ty >= 0 &&
            ty <= height;
        
        if (visible){
            visiblePoint2 = {point: point,x: tx,y: ty};
            console.log(visiblePoint2)
            tempElement.remove();
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

    //오른쪽 경계 x = width
    if (dx > 0) {
        var tRight = (width - x1) / dx;
        if (tRight >= 0) {
            var yRight = y1 + dy * tRight;
            if (yRight >= 0 && yRight <= height) {
                candidates.push({t: tRight,x: width,y: yRight});
            }
        }
    }
    //왼쪽 경계 x = 0
    if (dx < 0) {
        var tLeft = (0 - x1) / dx;
        if (tLeft >= 0) {
            var yLeft = y1 + dy * tLeft;
            if (yLeft >= 0 && yLeft <= height) {
                candidates.push({t: tLeft,x: 0,y: yLeft});
            }
        }
    }
    //아래쪽 경계 y = height
    if (dy > 0) {
        var tBottom = (height - y1) / dy;
        if (tBottom >= 0) {
            var xBottom = x1 + dx * tBottom;;
            if (xBottom >= 0 && xBottom <= width) {
                candidates.push({t: tBottom,x: xBottom,y: height});
            }
        }
    }
    //위쪽 경계 y = 0
    if (dy < 0) {
        var tTop = (0 - y1) / dy;
        if (tTop >= 0) {
            var xTop = x1 + dx * tTop;
            if (xTop >= 0 && xTop <= width) {
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

// 두 지점 간 방위각 계산 함수 (0°~360°, 북쪽=0, 동쪽=90)
function getBearing(lat1, lng1, lat2, lng2) {
    var radLat1 = lat1 * Math.PI / 180;
    var radLat2 = lat2 * Math.PI / 180;
    var dLng = (lng2 - lng1) * Math.PI / 180;

    var y = Math.sin(dLng) * Math.cos(radLat2);
    var x = Math.cos(radLat1) * Math.sin(radLat2) -
            Math.sin(radLat1) * Math.cos(radLat2) * Math.cos(dLng);

    var bearing = Math.atan2(y, x) * 180 / Math.PI;
    return (bearing + 360) % 360; // 0 ~ 360도로 정규화
}