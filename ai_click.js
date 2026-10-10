// 지도 클릭 → 클릭 지점에서 가장 가까운 설비 1개(맨홀·핸드홀·기계실·기타·배관)의 정보 모달.
// 오버레이별 onclick은 없앰. 오버레이는 pointer-events:none이라 클릭이 지도로 감 (index.html .overlay1)
var CLICK_MAX_M = 10;// 이 거리(m) 안에 있는 설비만 후보

function mapClick(latLng) {
    var lat = latLng.getLat(), lng = latLng.getLng();
    var bestPt = null, bestPipe = null;// 점 설비 / 배관 각각의 최단 {dist, type, item}

    function consider(dist, type, item) {
        if (dist > CLICK_MAX_M) return;
        if (type === "PPG") { if (!bestPipe || dist < bestPipe.dist) bestPipe = {dist: dist, type: type, item: item}; }
        else if (!bestPt || dist < bestPt.dist) bestPt = {dist: dist, type: type, item: item};
    }
    function pointDist(pos) {
        return getDistanceMeter(lat, lng, pos.getLat(), pos.getLng());
    }

    // 점 설비는 지도 레벨 3 이하에서만 그려지므로 그때만 후보 (안 보이는 걸 클릭할 순 없음)
    if (map.getLevel() <= 3) {
        MH_all.forEach(function(mh) { consider(pointDist(mh.position), "MH", mh); });
        HDH_all.forEach(function(h) { consider(pointDist(h.position), "HDH", h); });
        MCR_all.forEach(function(m) { consider(pointDist(m.position), "MCR", m); });
        ETC_all.forEach(function(e) { consider(pointDist(e.position), "ETC", e); });
    }

    // 배관은 화면에 그려진 것(PPG_on)만, 각 세그먼트까지 최단거리
    PPG_on.forEach(function(PPG) {
        for (var i = 0; i < PPG.coords.length - 1; i++) {
            var pos1 = PPG.coords[i], pos2 = PPG.coords[i + 1];
            var closestPt = getClosestPointOnLine(lat, lng,
                pos1.getLat(), pos1.getLng(), pos2.getLat(), pos2.getLng());
            consider(getDistanceMeter(lat, lng, closestPt.lat, closestPt.lng), "PPG", PPG);
        }
    });

    // 배관은 맨홀·핸드홀을 지나가므로 점 설비 근처에선 배관이 늘 더 가까움 → 범위 안에 점 설비가 있으면 점 설비 우선, 없을 때만 배관
    var best = bestPt || bestPipe;
    if (!best) return;
    var info = infoOf(best.type, best.item);
    openMcrModal(info.title, info.body);
}

// 설비 종류별 모달 제목/내용
function infoOf(type, it) {
    switch (type) {
        case "MH": return {
            title: `${it.name || '-'}`,
            body: `
                <b>규격(가로x세로x높이):</b> ${it.lt || '-'} x ${it.bt || '-'} x ${it.hg || '-'} m<br>
                <b>출입구 깊이:</b> ${it.dp || '-'} m<br>
                <b>상태등급:</b> ${it.grade || '-'} 등급<br>
                <b>위치설명:</b> ${it.lc || '-'}<br>
                <b>설치일자:</b> ${it.date || '-'}<br>
            `};
        case "HDH": return {
            title: `${it.name}(${it.srCode})`,
            body: `
                <b>밸브위치:</b> ${it.lc || '-'}<br>
                <b>깊이:</b> ${it.dp || '-'} m<br>
                <b>설치일:</b> ${it.date || '-'}<br>
                <b>등급:</b> ${it.grade || '-'}<br>
            `};
        case "MCR": return {
            title: `${it.buildName}(${it.roomName})<br>${it.buildId}(${it.roomId})`,
            body: `
                <b>차단밸브 관경:</b> ${it.dia || '-'} A<br>
                <b>열부하:</b> ${it.heat || '-'} Mcal/h<br>
                <b>세대수:</b> ${it.house || '-'} 세대<br>
                <b>기계실 위치:</b> ${it.roomLc || '-'}<br>
                <b>밸브 위치:</b> ${it.valveLc || '-'}<br>
                <b>밸브 형태:</b> ${it.valveKey || '-'}<br>
            `};
        case "ETC": return {
            title: `${it.NAME}`,
            body: `
                <b>특성:</b> ${it.ETC1 || '-'}<br>
            `};
        case "PPG": return {
            title: `${it.LINE_NM} (${it.srCode || '-'})`,
            body: `
                <b>설비ID:</b> ${it.eqpId || '-'}<br>
                <b>관경:</b> ${it.diaCode || '-'} mm<br>
                <b>설치일자:</b> ${it.competDe || '-'}<br>
                <b>상태:</b> ${it.qltyGrade || '-'}<br>
                <b>평균깊이:</b> ${it.avgDph || '-'} m
            `};
    }
}
