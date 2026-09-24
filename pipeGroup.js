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
        overlays[idx].setMap(null);
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
var camPosition = null;
var CAMERA_FOV = 60;

function PPGcamUpdate(event){
    // 기존 점 삭제
    camSVG.replaceChildren();

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

    getCurrentLocation();// 현재 카메라 위치 

    if (camPosition == null) {
        console.log("현재 카메라 위치가 없습니다.");
        return;
    }

    var lat = camPosition.lat;
    var lng = camPosition.lng;

    // 북쪽 3m
    var point3m = getPointByDistance(lat, lng, 0, 3);

    // 북쪽 5m
    var point5m = getPointByDistance(lat, lng, 0, 5);


    drawProjectedPoint(camSVG,point3m,3,heading);
    drawProjectedPoint(camSVG,point5m,5,heading);
}
function testCamPoint(svg, distance) {
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

            camPosition = {
                lat: position.coords.latitude,
                lng: position.coords.longitude
            };

            console.log(
                "카메라 위치:",
                camPosition.lat,
                camPosition.lng
            );
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
function drawProjectedPoint(svg, point, distance, heading) {

    var rect = svg.getBoundingClientRect();

    var width = rect.width;
    var height = rect.height;

    var centerX = width / 2;
    var centerY = height / 2;

    // 점의 방위각
    var bearing = getBearing(
        camPosition.lat,
        camPosition.lng,
        point.getLat(),
        point.getLng()
    );

    // 카메라 정면을 기준으로 한 각도
    var relativeAngle = bearing - heading;

    // -180 ~ +180
    while (relativeAngle > 180) {
        relativeAngle -= 360;
    }

    while (relativeAngle < -180) {
        relativeAngle += 360;
    }

    // 화면 밖이면 표시하지 않음
    if (
        relativeAngle < -CAMERA_FOV / 2 ||
        relativeAngle > CAMERA_FOV / 2
    ) {
        return;
    }

    // 화면 X 위치
    var x =
        centerX +
        (relativeAngle / (CAMERA_FOV / 2)) *
        centerX;

    // 일단 Y는 화면 중앙
    var y = centerY;

    var circle = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "circle"
    );

    circle.setAttribute("cx", x);
    circle.setAttribute("cy", y);
    circle.setAttribute("r", 10);

    circle.setAttribute(
        "data-distance",
        distance
    );

    svg.appendChild(circle);

    console.log(
        distance + "m",
        "bearing =", bearing,
        "heading =", heading,
        "relative =", relativeAngle,
        "screen =", x, y
    );
}