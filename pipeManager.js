// 변수 함수 이륻들 다시생각
// 공급 회수 라벨위치 다시 생각
//선택배관의 중심점으로 방향보고 위아래 정하기

// 전역 데이터 변수
var Pipes_data = []; 

var visiblePipes = []; 
var polylines = []; 
var idx_groups = [];
var visited = [];
var overlays = [];
var infoWindow = null;

var threshold = 0.00005; // 좌표 비교 오차 범위 (약 1m 이내 접촉 여부)

// 1. 배관 관련 그래픽 요소를 화면에서 제거
function clearPipes() {
    if (infoWindow) infoWindow.close();
    for (var idx = 0; idx < overlays.length; idx++) {
        overlays[idx].setMap(null);
    }
    for (var idx = 0; idx < polylines.length; idx++) {
        polylines[idx].setMap(null);
    }
    visiblePipes = []; 
    polylines = []; 
    idx_groups = [];
    visited = [];
    overlays = [];
    infoWindow = null;
}

// 3. 지도 레벨/영역 조건에 맞는 배관 선 그리기
function drawPipes() {
    if (!map || Pipes_data.length === 0) return;
    if (map.getLevel() >= 5) return;

    var mapBounds = map.getBounds();

    for (var i = 0; i < Pipes_data.length; i++) {
        var pipe = Pipes_data[i];

        if (mapBounds.intersects(pipe.bounds)) {
            var lineColor = '#FF0000';
            if (pipe.srCode === 'R') lineColor = '#FFA000';
            else if (pipe.srCode !== 'S') lineColor = '#888888';

            var polyline = new kakao.maps.Polyline({
                path: pipe.path,
                strokeWeight: 1,
                strokeColor: lineColor,
                strokeStyle: 'solid'
            });

            polyline.setMap(map);
            polylines.push(polyline);
            visiblePipes.push(pipe);

            (function(targetPolyline, targetPipe) {
                kakao.maps.event.addListener(targetPolyline, 'click', function(mouseEvent) {
                    if (infoWindow) infoWindow.close();

                    var srText = targetPipe.srCode === 'S' ? '공급관(S)' : (targetPipe.srCode === 'R' ? '회수관(R)' : '기타');

                    var infoContent = 
                        '<div style="padding:10px; font-size:12px; width:220px; line-height:1.6; color:#333;">' +
                            '<div style="font-weight:bold; font-size:13px; border-bottom:2px solid #2b6cb0; padding-bottom:3px; margin-bottom:6px;">' +
                                '배관 상세 정보 (' + targetPipe.eqpId + ')' +
                            '</div>' +
                            '<b>구분:</b> ' + srText + '-' + (targetPipe.pipePress || '-') + 'bar<br>' +
                            '<b>관경:</b> ' + (targetPipe.diaCode || '-') + 'A'+ '<br>' +
                            '<b>길이:</b> ' + (targetPipe.plineLt || '-') + ' m<br>' +
                            '<b>심도:</b> ' + (targetPipe.avgDph || '-') + ' m<br>' +
                            '<b>설치일:</b> ' + (targetPipe.competDe || '-') + '<br>' +
                            '<b>공사명:</b> ' + (targetPipe.cntrwkNm || '-') +
                        '</div>';

                    infoWindow = new kakao.maps.InfoWindow({
                        position: mouseEvent.latLng,
                        content: infoContent,
                        removable: true
                    });

                    infoWindow.open(map);
                });
            })(polyline, pipe);
        }
    }
}

// 4. 배관 연결성 검사 보조 함수
function gap_checker(pt1, pt2) {
    var dLat = Math.abs(pt1.getLat() - pt2.getLat());
    var dLng = Math.abs(pt1.getLng() - pt2.getLng());
    return (dLat < threshold && dLng < threshold);
}

function isConnected(pipeA, pipeB) {
    if (pipeA.diaCode !== pipeB.diaCode) return false;
    if (pipeA.srCode !== pipeB.srCode) return false;

    var p1_start = pipeA.path[0];
    var p1_end = pipeA.path[pipeA.path.length - 1];
    var p2_start = pipeB.path[0];
    var p2_end = pipeB.path[pipeB.path.length - 1];

    return gap_checker(p1_start, p2_start) || gap_checker(p1_start, p2_end) ||
        gap_checker(p1_end, p2_start) || gap_checker(p1_end, p2_end);
}

// 5. 그룹화 알고리즘 및 라벨 표출
function make_groups() {
    if (map.getLevel() >= 3) return;
    if (visiblePipes.length === 0) return;

    visited = new Array(visiblePipes.length).fill(false);
    
    for (var i = 0; i < visiblePipes.length; i++) {
        if (visited[i]) continue;

        var group = [];
        var queue = [i];
        visited[i] = true;

        while (queue.length > 0) {
            var curr = queue.shift();
            group.push(curr);

            for (var j = 0; j < visiblePipes.length; j++) {
                if (visited[j]) continue;

                if (isConnected(visiblePipes[curr], visiblePipes[j])) {
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

        var targetPipeIndex = groupIndices.reduce(function(maxIdx, currIdx) {
            var maxLen = parseFloat(visiblePipes[maxIdx].plineLt) || 0;
            var currLen = parseFloat(visiblePipes[currIdx].plineLt) || 0;
            return currLen > maxLen ? currIdx : maxIdx;
        }, groupIndices[0]);

        var targetPipe = visiblePipes[targetPipeIndex];
        //if (targetPipe.srCode === 'R') continue; //극단적
        //var midCoordIndex = Math.floor(targetPipe.path.length / 2);
        var midCoordIndex = Math.ceil(targetPipe.path.length / 2);
        if (targetPipe.srCode === 'R' && midCoordIndex >= 1) midCoordIndex -= 1;
        var centerPosition = targetPipe.path[midCoordIndex];

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
        overlays.push(overlay);
    }
}

function updatPipes(){
    clearPipes();
    drawPipes();
    make_groups();
}

// 2. CSV 파일 데이터 파싱
function parsePipeCsv(csvText) {
    Pipes_data = [];

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
            var linePath = [];
            var minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;

            for (var j = 0; j < rawCoords.length; j++) {
                var lng = parseFloat(rawCoords[j][0]);
                var lat = parseFloat(rawCoords[j][1]);
                linePath.push(new kakao.maps.LatLng(lat, lng));

                if (lat < minLat) minLat = lat;
                if (lat > maxLat) maxLat = lat;
                if (lng < minLng) minLng = lng;
                if (lng > maxLng) maxLng = lng;
            }

            Pipes_data.push({
                eqpId: eqpId,
                srCode: srCode,
                diaCode: diaCode,
                cntrwkNm: cntrwkNm,
                pipePress: pipePress,
                plineLt: plineLt,
                competDe: competDe,
                qltyGrade: qltyGrade,
                avgDph: avgDph,
                path: linePath,
                bounds: new kakao.maps.LatLngBounds(
                    new kakao.maps.LatLng(minLat, minLng),
                    new kakao.maps.LatLng(maxLat, maxLng)
                )
            });

        } catch (e) {
            console.error(i + "번째 행 좌표 변환 실패:", e);
        }
    }
    updatPipes();
}