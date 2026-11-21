/* 선생님 전용 학습 관찰. 속도는 능력 점수로 환산하지 않는다. */
(function () {
  'use strict';
  var CATEGORIES = { school:'학교생활', learning:'공부·진로', access:'소통·접근성', nature:'환경·생태', science:'과학·수학', civic:'우리 동네', media:'미디어·AI', art:'예술·이야기', games:'게임', computing:'컴퓨팅·데이터', arduino:'로봇·아두이노' };
  // 추천은 관심 분야와 학생이 고른 난이도를 근거로 한다. 진도와 속도로 배운 개념을 추측하지 않는다.
  function recommendations(surveys, catalog) {
    if (!surveys.length) return [];
    var scores = {}, latest = surveys[0], recent = latest.at - 90 * 86400000;
    surveys.filter(function (s) { return s.at >= recent; }).slice(0, 4).forEach(function (s, i) {
      s.answers.interests.forEach(function (c) { scores[c] = (scores[c] || 0) + (i === 0 ? 3 : 1); });
    });
    return Object.keys(scores).sort(function (a,b) { return scores[b]-scores[a]; }).slice(0,3).map(function (c) {
      var choices = catalog.filter(function (x) { return x.category === c; });
      var wanted = latest.answers.difficulty === 3 || latest.answers.approach === 'ask' ? 0 : latest.answers.difficulty === 1 ? 2 : 1;
      choices.sort(function (a,b) { return Math.abs(a.level-wanted)-Math.abs(b.level-wanted) || a.id.localeCompare(b.id); });
      return { project: choices[0], reason: CATEGORIES[c] + '에 관심을 표시했어요. ' + (wanted === 0 ? '작게 완성하고 확장하는 시작안을 권해요.' : wanted === 2 ? '쉽다고 답해 확장할 여지가 있는 주제를 골랐어요.' : '알맞은 난이도에서 시작해 함께 조정해요.') };
    }).filter(function (x) { return x.project; });
  }
  window.CHLearning = { recommendations: recommendations, render: function (root, students, api) {
    function el(tag, text, cls) { var n = document.createElement(tag); if (text != null) n.textContent = text; if (cls) n.className = cls; return n; }
    root.append(el('h1','학습 관찰 · 프로젝트 추천'), el('p','주 1회 수업의 몇 주간 변화를 함께 살펴보세요. 사이트 이용이 주 1시간이어도 정상입니다. 로봇·종이 활동은 별도 관찰로 보충하며, 활동 시간은 화면이 활성화되고 최근 1분 안에 조작한 시간의 추정치입니다. 생각하는 시간은 빠질 수 있고 빠르기로 능력을 평가하지 않습니다.','ad-note'));
    var tools = el('div',null,'ad-tools'), pick = el('select'), month = el('input'), go = el('button','조회','ad-btn'), result = el('div');
    pick.setAttribute('aria-label','학생'); month.type = 'month'; month.setAttribute('aria-label','조회 월');
    var now = new Date(); month.value = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0');
    students.filter(function (s) { return !s.pending; }).forEach(function (s) { var o=el('option',s.name + (s.group ? ' · '+s.group : '')); o.value=s.id; pick.appendChild(o); });
    tools.append(pick,month,go); root.append(tools,result); var generation=0;
    async function draw() {
      var id=pick.value, current=++generation; if (!id || !month.value) return;
      result.textContent='기록을 불러오는 중…';
      try {
        var out=await api('learningReport',{studentId:id,month:month.value});
        if (current !== generation) return;
        result.textContent=''; var sessions=out.sessions || [], surveys=out.surveys || [], total=sessions.reduce(function (n,s) { return n+s.activeSeconds; },0);
        var attempts=sessions.reduce(function(n,s){return n+s.attempts;},0), correct=sessions.reduce(function(n,s){return n+s.correct;},0), hints=sessions.reduce(function(n,s){return n+s.hints;},0);
        var summary=el('div',null,'ad-stats');
        [[Math.round(total/60)+'분','활동 시간 추정'],[sessions.length+'회','학습 페이지 이용'],[attempts ? Math.round(correct*100/attempts)+'%' : '미수집','채점 기록의 정답 비율'],[hints ? hints+'회' : '미수집','기록된 힌트 사용']].forEach(function(x){ var n=el('div',null,'ad-stat');n.append(el('b',x[0]),el('span',x[1]));summary.appendChild(n); });
        result.append(summary,el('p','정답 비율은 채점 기록이 연결된 문제만 집계합니다. 워크북 진행률은 정답률과 다르며, 이 기능을 도입하기 전의 시간은 알 수 없습니다.','ad-note'));
        var weeks = new Set(sessions.map(function(s){var d=new Date(s.at);d.setDate(d.getDate()-((d.getDay()+6)%7));return d.toLocaleDateString('ko-KR');}));
        if (weeks.size < 4) result.appendChild(el('p','현재 '+weeks.size+'주 기록입니다. 관찰 초기이므로 성향을 단정하지 않고 학생과 대화할 때 참고해 주세요.','ad-note'));
        var obs=el('section',null,'ad-card');obs.append(el('h2','로봇 · 교실 활동 보충'),el('p','사이트 밖에서 한 조립·실험·협업을 간단히 남겨 주세요. 이 시간은 자동 측정 시간과 합산하지 않습니다.','ad-note'));
        (out.observations || []).forEach(function(o){obs.appendChild(el('p',new Date(o.at).toLocaleDateString('ko-KR')+' · 로봇 활동 '+o.robotMinutes+'분(선생님 입력) · '+o.note));});
        var form=el('form'),day=el('input'),minutes=el('input'),note=el('textarea'),save=el('button','관찰 저장','ad-btn');
        day.type='date';day.required=true;day.value=month.value === now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0') ? month.value+'-'+String(now.getDate()).padStart(2,'0') : month.value+'-01';day.setAttribute('aria-label','수업 날짜');minutes.type='number';minutes.min='0';minutes.max='120';minutes.value='60';minutes.setAttribute('aria-label','로봇 활동 분');note.maxLength=1000;note.required=true;note.rows=3;note.placeholder='예: 센서가 잘못 읽은 이유를 스스로 바꿔 실험함. 친구에게 조립 방법을 설명함.';note.setAttribute('aria-label','교실 관찰');save.type='submit';
        var fields=el('div',null,'ad-tools');fields.append(day,el('span','로봇 활동(분)'),minutes);var field=el('label','관찰 메모','ad-field');field.appendChild(note);form.append(fields,field,save);obs.appendChild(form);result.appendChild(obs);
        form.onsubmit=async function(e){e.preventDefault();if(day.value.slice(0,7)!==month.value){alert('조회 중인 달의 수업 날짜를 골라 주세요.');return;}save.disabled=true;try{await api('learningNote',{studentId:id,day:day.value,note:note.value,robotMinutes:Number(minutes.value)});draw();}catch(e){alert(e.message);save.disabled=false;}};
        if (!sessions.length) result.appendChild(el('p','이 달에는 새 관찰 기록이 없어요. 학생이 로그인한 뒤 수업에서 활동하면 쌓입니다.','ad-card'));
        var history=el('section',null,'ad-card'); history.appendChild(el('h2','학습 기록'));
        sessions.slice().sort(function(a,b){return b.at-a.at;}).forEach(function(s){ var row=el('p'); row.textContent=new Date(s.at).toLocaleDateString('ko-KR')+' · '+s.title+' · 약 '+Math.round(s.activeSeconds/60)+'분 · 저장 시 진행 '+s.done+'/'+s.total+(s.attempts ? ' · 채점 '+s.correct+'/'+s.attempts : ''); history.appendChild(row); }); result.appendChild(history);
        var survey=el('section',null,'ad-card'); survey.appendChild(el('h2','관심과 수업 느낌의 변화'));
        if (!surveys.length) survey.appendChild(el('p','아직 설문이 없어요. 학생 수업 화면의 ‘오늘의 관심’에서 답할 수 있어요.','ad-note'));
        surveys.forEach(function(s){ var q=s.answers; survey.appendChild(el('p',new Date(s.at).toLocaleDateString('ko-KR')+' · '+q.interests.map(function(c){return CATEGORIES[c];}).join(', ')+' · '+['','다른 것도 해보고 싶어요','보통이에요','재미있었어요'][q.fun]+' · '+['','쉬웠어요','알맞았어요','어려웠어요'][q.difficulty]+' · '+({try:'먼저 실험',hint:'힌트 찾기',ask:'함께 풀기'})[q.approach])); }); result.appendChild(survey);
        var rec=el('section',null,'ad-card');rec.append(el('h2','다음 프로젝트 상담 초안'),el('p','최근 90일 설문을 우선 반영합니다. 적성 검사나 실력 판정이 아니며, 선생님이 선수 개념과 학생의 현재 흥미를 확인해 정합니다.','ad-note'));result.appendChild(rec);
        if (!surveys.length || Date.now()-surveys[0].at>90*86400000) { rec.appendChild(el('p','최근 관심을 한 번 더 물어본 뒤 추천해 주세요.')); return; }
        var r=await fetch('learning-projects.json').then(function(x){if(!x.ok) throw Error('추천 목록을 불러오지 못했어요.');return x.json();});
        if(current!==generation)return;
        recommendations(surveys,r).forEach(function(x){var box=el('div',null,'ad-learning-pick'),a=el('a',x.project.title,'ad-btn ghost');a.href='v/project-lab/'+encodeURIComponent(x.project.id)+'/';a.target='_blank';a.rel='noopener';box.append(a,el('p',x.reason),el('small','시작 전 함께 확인: '+x.project.prerequisites));rec.appendChild(box);});
      } catch(e) { if(current===generation) { result.textContent='학습 관찰을 불러오지 못했어요: '+e.message; if(/알 수 없는 요청/.test(e.message)) result.appendChild(el('p','기록 서버(server/record.gs)를 기존 Apps Script 배포의 새 버전으로 반영하면 사용할 수 있어요.')); } }
    }
    go.onclick=draw; pick.onchange=draw; month.onchange=draw; draw();
  } };
})();
