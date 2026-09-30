var roadUpdateTimer = null;
var roadRect = null;
var roadWt = null;
var roadHt = null;
var roadDistance = 30;

var roadPPG_over = [];
var roadPipe_ = [];
var roadPPG_label = [];


function openRoadView(position) {
    cMode = "road";
    allNone();
    document.getElementById('roadBox').style.display = 'block';
    document.getElementById('closeRoadBtn').style.display = 'block';

    roadView.relayout();// 지도의 크기를 변경하거나 숨김 상태에서 보인 직후에 호출

    // 특정 위치의 좌표와 가까운 로드뷰의 panoId를 추출하여 로드뷰를 띄운다.
    roadClient.getNearestPanoId(position, 50, function(panoId) {
        if (panoId === null) {
            alert('이 위치 주변에는 로드뷰를 지원하지 않습니다.');  
            closeRoadview();
            return;
        }
        roadView.setPanoId(panoId, position);
    });
}
function closeRoadView() {
    cMode = "map";
    allNone();
    document.getElementById('map').style.display = 'block';
    document.getElementById('normalBtn').style.display = 'block';
    document.getElementById('satelliteBtn').style.display = 'block';
    document.getElementById('myLocationBtn').style.display = 'block';
    document.getElementById('roadModeBtn').style.display = 'block';
    document.getElementById('openCamBtn').style.display = 'block';

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
    road_PPG();
    // 프레임 지연으로 DOM 레이아웃 확정 보장
    requestAnimationFrame(function() {
        drawSvgPPG();
    });
}

function road_PPG() {
    // 배관 관련 그래픽 요소를 화면에서 제거
    for (var idx = 0; idx < roadPPG_label.length; idx++) {
        roadPPG_label[idx].setMap(null);
    }
    for (var i = 0; i < roadPPG_over.length; i++) {
        roadPPG_over[i].setMap(null);
    }
    roadPPG_label = [];
    roadPPG_over = [];
    roadPipe_ = [];

    var cPos = roadView.getPosition(); 
    if (!cPos) return;
    var cLat = cPos.getLat();
    var cLng = cPos.getLng();

    all_PPG.forEach(function(PPG, id0) {
        if (!PPG.coords || PPG.coords.length < 2) return;

        for (var id1 = 0; id1 < PPG.coords.length - 1; id1++) {
            var pos1 = PPG.coords[id1];
            var pos2 = PPG.coords[id1 + 1];

            var closestPt = getClosestPointOnLine(
                cLat, cLng,
                pos1.getLat(), pos1.getLng(),
                pos2.getLat(), pos2.getLng()
            );

            var distance = getDistanceMeter(cLat, cLng, closestPt.lat, closestPt.lng);
            if (distance > roadDistance) continue;
        
            var element1 = makePPGpoint(pos1, id0, id1, PPG);
            var element2 = makePPGpoint(pos2, id0, id1+1, PPG);

            var color = '#888888';
            if (PPG.srCode === 'S') color = '#FF0000';
            if (PPG.srCode === 'R') color = '#FFA000';

            roadPipe_.push({
                id0: id0,           // ★ PPG 식별 ID 추가
                el1: element1,
                el2: element2,
                pos1: pos1,
                pos2: pos2,
                inner1: false,
                inner2: false,
                x1:0,y1:0,x2:0,y2:0,
                color: color,
            });
        }
    });
}


// 오버레이 생성 후 객체/DOM 참조 반환
function makePPGpoint(pos, PPGidx, pointIdx, PPG) {
    var labelClass = PPG.srCode === 'S' ? 'road-s-point' : 'road-r-point';

    // 1. 문자열 대신 DOM 엘리먼트 생성
    var element = document.createElement('div');
    element.className = 'road-point-overlay ' + labelClass;
    element.setAttribute('PPGidx', PPGidx);
    element.setAttribute('pointIdx', pointIdx);
    element.innerHTML = '●';
    element.style.opacity = '0';//투명

    // 2. CustomOverlay에 DOM 엘리먼트 전달
    var overlay = new kakao.maps.CustomOverlay({
        position: pos,
        content: element, // DOM Element 전달
        xAnchor: 0.5,
        yAnchor: 0.5
    });    

    overlay.setMap(roadView);
    roadPPG_over.push(overlay);

    return element
}

function drawSvgPPG() {
    console.log("drawSvgPPG")
    if (!roadSVG || !roadPipe_) return;
    roadRect = roadSVG.getBoundingClientRect();
    roadWt = roadRect.width;
    roadHt = roadRect.height;
    if (roadWt <= 0 || roadHt <= 0) return;
    roadSVG.setAttribute('width', roadWt);
    roadSVG.setAttribute('height', roadHt);
    roadSVG.setAttribute('viewBox', '0 0 ' + roadWt + ' ' + roadHt);

    roadPipe_.forEach(function(pipe) {

        //isVisiblePipe(pipe);
        var margin = 1;// 화면 안쪽에 있는지 검사시 여유값

        var rect1 = pipe.el1.getBoundingClientRect()
        if (rect1.width === 0 && rect1.height === 0) 
            pipe.inner1 = false;//아직 DOM 배치가 안 되었거나 크기가 0이면 오버레이 안보임
        else{
            pipe.x1 = rect1.left + rect1.width / 2 - roadRect.left;
            pipe.y1 = rect1.top + rect1.height / 2 - roadRect.top;

            if (pipe.x1 >= -margin && pipe.x1 <= roadWt + margin &&
                pipe.y1 >= -margin && pipe.y1 <= roadHt + margin) 
                pipe.inner1 = true;
        }

        var rect2 = pipe.el2.getBoundingClientRect()
        if (rect2.width === 0 && rect2.height === 0)
            pipe.inner2 = false;//아직 DOM 배치가 안 되었거나 크기가 0이면 오버레이 안보임
        else{
            pipe.x2 = rect2.left + rect2.width / 2 - roadRect.left;
            pipe.y2 = rect2.top + rect2.height / 2 - roadRect.top;

            if (pipe.x2 >= -margin && pipe.x2 <= roadWt + margin &&
                pipe.y2 >= -margin && pipe.y2 <= roadHt + margin) 
                pipe.inner2 = true;
        }
        //isVisiblePipe(pipe);
        
        if (pipe.inner1 && pipe.inner2) 
            lineDraw(pipe.x1, pipe.y1, pipe.x2, pipe.y2, pipe.color);
        if (pipe.inner1 && !pipe.inner2){
            var tempPoint = findVisibleTempPoint(pipe.pos1, pipe.pos2, pipe.PPGidx)
            if (tempPoint) {// pos1 → 임시점 방향
                var dx = tempPoint.x - pipe.x1;
                var dy = tempPoint.y - pipe.y1;
                var end = extendToScreenEdge(pipe.x1, pipe.y1, dx, dy);

                lineDraw(pipe.x1, pipe.y1, end.x, end.y, pipe.color);
            }
            
        }
        if (!pipe.inner1 && pipe.inner2){
            var tempPoint = findVisibleTempPoint(pipe.pos2,pipe.pos1,pipe.PPGidx)
            if (tempPoint) {// pos1 → 임시점 방향
                var dx = tempPoint.x - pipe.x2;
                var dy = tempPoint.y - pipe.y2;
                var end = extendToScreenEdge(pipe.x2, pipe.y2, dx, dy);

                lineDraw(pipe.x2, pipe.y2, end.x, end.y, pipe.color);
            }
        }
        if (!pipe.inner1 && !pipe.inner2) {
            var tempPoints = findVisibleTempPoint2(pipe.pos1,pipe.pos2,pipe.PPGidx);
            if (tempPoints.point1 && tempPoints.point2) {
                var dx = tempPoints.point1.x - tempPoints.point2.x;
                var dy = tempPoints.point1.y - tempPoints.point2.y;
                var end1 = extendToScreenEdge(tempPoints.point1.x, tempPoints.point1.y, dx, dy);
                var end2 = extendToScreenEdge(tempPoints.point2.x, tempPoints.point2.y, -dx, -dy);

                lineDraw(end1.x, end1.y, end2.x, end2.y, pipe.color);
            }
        }
    });

    // 2. ★ id0별 대표 선분 1개 골라 SVG 라벨 그리기
    var drawnLabelIds = {}; // 이미 그려진 id0 기록

    roadPipe_.forEach(function(pipe) {
        if (drawnLabelIds[pipe.id0]) return; // 이미 그렸다면 스킵

        // ★ id0 값으로 all_PPG에서 대상 PPG 객체 가져오기
        var PPG = all_PPG[pipe.id0];
        if (!PPG) return;

        var centerPos = getPointAtRatio(pipe.pos1, pipe.pos2, 0.5); // 중간 지점 좌표

        // PPG 속성 추출
        var pipeName = PPG.eqpId || PPG.cntrwkNm || '배관';
        var labelText = pipeName + ' (' + (PPG.diaCode || '') + 'A)';

        // CSS 클래스 분기 (S: 빨강, R: 주황, 기타: 회색)
        var labelClass = 'road-label-default';
        if (PPG.srCode === 'S') labelClass = 'road-label-s';
        else if (PPG.srCode === 'R') labelClass = 'road-label-r';

        var content = '<div class="road-pipe-label ' + labelClass + '">' + labelText + '</div>';

        var overlay = new kakao.maps.CustomOverlay({
            position: centerPos,
            content: content,
            xAnchor: 0.5,
            yAnchor: 0.5
        });

        overlay.setMap(roadView);
        roadPPG_label.push(overlay); // 배열에 추가하여 다음 화면 업데이트 시 함께 제거되도록 설정

        drawnLabelIds[pipe.id0] = true; // 처리 완료 표기
    });
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

function findVisibleTempPoint(pos1, pos2, PPGidx) {
    var ratios = [0.8,0.5,0.2,0.05];

    for (var i = 0; i < ratios.length; i++) {
        var point = getPointAtRatio(pos1,pos2,ratios[i]);

        var tempElement = makePPGpoint(point,PPGidx,-1,{ srCode: 'TEMP' });
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
function findVisibleTempPoint2(pos1, pos2, PPGidx) {
    var ratios1 = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
    var ratios2 = [0.05, 0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85];
    var visiblePoint1 = null;
    var visiblePoint2 = null;

    for (var i = 0; i < ratios1.length; i++) {
        var point = getPointAtRatio(pos1,pos2,ratios1[i]);
        var tempElement = makePPGpoint(point,PPGidx,-1,{ srCode: 'TEMP' });
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
        var point = getPointAtRatio(pos2,pos1,ratios2[i]);
        var tempElement = makePPGpoint(point,PPGidx,-1,{ srCode: 'TEMP' });
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