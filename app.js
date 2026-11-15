(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  };
  let data;
  try { data = SanData.normalize(globalThis.SAN_SETTINGS); }
  catch (error) {
    console.error(error);
    const message = el('p', 'portfolio-error', '페이지 설정을 확인할 수 없습니다. 잠시 후 다시 방문해주세요.');
    message.setAttribute('role','alert');
    document.querySelector('main').prepend(message);
    return;
  }
  document.title = `${data.name} | 일정과 포트폴리오`;
  document.querySelector('h1').textContent = `${data.name}의 일정과 포트폴리오`;
  let today = SanData.seoulToday();
  let [year, month] = today.split('-').map(Number);
  const memoDialog = $('memoDialog'), mediaDialog = $('mediaDialog');
  let previousFocus;
  function showDialog(dialog) {
    previousFocus = document.activeElement;
    dialog.showModal();
    document.body.classList.add('dialog-open');
    dialog.querySelector('.dialog-close').focus();
  }
  function closeDialog(dialog) { dialog.close(); }
  for (const dialog of [memoDialog,mediaDialog]) {
    dialog.querySelector('.dialog-close').addEventListener('click',()=>closeDialog(dialog));
    dialog.addEventListener('click',e=>{if(e.target===dialog || e.target===$('mediaContent')) closeDialog(dialog);});
    dialog.addEventListener('close',()=>{
      if(dialog===mediaDialog) $('mediaContent').replaceChildren(); // 닫을 때 확대 이미지를 해제합니다.
      document.body.classList.remove('dialog-open');
      previousFocus?.focus({preventScroll:true});
    });
  }
  function openMemo(key) {
    $('memoTitle').textContent = key.replaceAll('-','.') + ' 메모';
    $('memoText').textContent = data.notes[key];
    showDialog(memoDialog);
  }
  function renderCalendar() {
    today = SanData.seoulToday();
    $('calMonthLabel').textContent = `${year}년 ${month}월`;
    $('calDays').replaceChildren();
    $('monthNoteList').replaceChildren();
    const first = new Date(Date.UTC(year,month-1,1)).getUTCDay();
    const dim = new Date(Date.UTC(year,month,0)).getUTCDate();
    const total = Math.ceil((first+dim)/7)*7;
    const prefix = `${year}-${String(month).padStart(2,'0')}-`;
    for(let i=0;i<total;i++) {
      const date = new Date(Date.UTC(year,month-1,i-first+1));
      const inMonth = date.getUTCMonth()===month-1;
      const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,'0')}-${String(date.getUTCDate()).padStart(2,'0')}`;
      const cell = el('div','cal-day');
      if(!inMonth) cell.classList.add('other-month');
      if(i%7===0)cell.classList.add('sunday');
      if(i%7===6)cell.classList.add('saturday');
      cell.dataset.date=key;
      cell.append(el('div','day-num',date.getUTCDate()));
      if(inMonth) {
        const type = SanData.statusFor(key,data,today);
        cell.append(el('span','cal-badge '+type,SanData.labels[type]));
        cell.setAttribute('aria-label',`${key} ${SanData.labels[type]}`);
        if(key===today) { cell.classList.add('today'); cell.setAttribute('aria-current','date'); }
        if(data.notes[key]) {
          const note = el('button','cal-note',data.notes[key]);
          note.type='button'; note.title=data.notes[key];
          note.setAttribute('aria-label',`${key} 메모 전체 보기: ${data.notes[key]}`);
          note.addEventListener('click',()=>openMemo(key));
          cell.append(note);
        }
      } else cell.setAttribute('aria-hidden','true');
      $('calDays').append(cell);
    }
    const notes = Object.entries(data.notes).filter(([key])=>key.startsWith(prefix)).sort(([a],[b])=>a.localeCompare(b));
    $('monthNotes').hidden=!notes.length;
    for(const [key,text] of notes) {
      const button=el('button','month-note'); button.type='button';
      const time=el('time','',key.slice(5).replace('-','.')); time.dateTime=key;
      button.append(time,el('span','',text));
      button.setAttribute('aria-label',`${key} 메모 전체 보기: ${text}`);
      button.addEventListener('click',()=>openMemo(key));
      $('monthNoteList').append(button);
    }
  }
  function moveMonth(delta) {
    const next=new Date(Date.UTC(year,month-1+delta,1));
    if(next.getUTCFullYear()<1000 || next.getUTCFullYear()>9999) return;
    year=next.getUTCFullYear(); month=next.getUTCMonth()+1; renderCalendar();
  }
  $('calPrev').addEventListener('click',()=>moveMonth(-1));
  $('calNext').addEventListener('click',()=>moveMonth(1));
  $('calToday').addEventListener('click',()=>{[year,month]=SanData.seoulToday().split('-').map(Number);renderCalendar();});
  renderCalendar();
  // 오래 열어 둔 탭도 한국 시간 자정 이후 자동으로 지난 날짜를 마감합니다.
  setInterval(()=>{if(SanData.seoulToday()!==today)renderCalendar();},30000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)renderCalendar();});

  function openImage(value,title) {
    const content=$('mediaContent'); content.replaceChildren();
    const image=el('img');image.src=value;image.alt=title;content.append(image);
    showDialog(mediaDialog);
  }
  function portfolioImage(value,title) {
    const img=el('img');img.src=value;img.alt=title;img.loading='lazy';img.decoding='async';
    img.addEventListener('error',()=>{img.alt='이미지를 불러올 수 없습니다 · '+title;img.classList.add('image-error');},{once:true});
    return img;
  }
  function imageButton(value,title,cls) {
    const button=el('button',cls);button.type='button';button.setAttribute('aria-label',title+' 이미지 확대');
    button.append(portfolioImage(value,title));
    button.addEventListener('click',()=>openImage(value,title));
    return button;
  }
  function wireTabs(tabs,activate) {
    const buttons=[...tabs.querySelectorAll('[role="tab"]')];
    buttons.forEach((button,i)=>{
      button.addEventListener('click',()=>{
        buttons.forEach(b=>{const active=b===button;b.classList.toggle('active',active);b.setAttribute('aria-selected',String(active));b.tabIndex=active?0:-1;});
        activate(i);
      });
      button.addEventListener('keydown',e=>{
        let next;
        if(e.key==='ArrowRight')next=(i+1)%buttons.length;
        else if(e.key==='ArrowLeft')next=(i-1+buttons.length)%buttons.length;
        else if(e.key==='Home')next=0;
        else if(e.key==='End')next=buttons.length-1;
        if(next!=null){e.preventDefault();buttons[next].click();buttons[next].focus({preventScroll:true});}
      });
    });
  }
  let gridMode=true;
  const carousels=[];
  function resizeCarousels(){for(const carousel of carousels)if(carousel.root.offsetWidth)carousel.api.center('auto');}
  function buildPortfolio(categories) {
    const tabs=$('imageTypeTabs'),content=$('imageTypeSections');
    if(!categories.length){content.append(el('p','portfolio-empty','등록된 이미지가 없습니다.'));return;}
    categories.forEach((category,index)=>{
      const tab=el('button','pf-type-btn'+(index===0?' active':''),category.title);tab.type='button';tab.setAttribute('role','tab');
      tab.id=`image-category-${index}`;tab.setAttribute('aria-controls',`image-content-${index}`);tab.setAttribute('aria-selected',String(index===0));tab.tabIndex=index===0?0:-1;tabs.append(tab);
      const section=el('div','pf-type-section'+(index===0?' active':''));section.hidden=index!==0;
      section.id=`image-content-${index}`;section.setAttribute('role','tabpanel');section.setAttribute('aria-labelledby',tab.id);content.append(section);
      const items=category.images;
      if(!items.length){section.append(el('p','portfolio-empty','등록된 이미지가 없습니다.'));return;}
      const toolbar=el('div','portfolio-toolbar'),toggle=el('button','portfolio-mode');toggle.type='button';toolbar.append(toggle);section.append(toolbar);
      const grid=el('div','portfolio-grid image'),slider=el('div','img-slider-root'),stage=el('div','img-stage');
      items.forEach((value,i)=>{
        const title=category.title+' '+(i+1);
        grid.append(imageButton(value,title));
        const slide=el('div','img-slide'+(i===0?' active':''));
        slide.append(imageButton(value,title,'media-trigger'));stage.append(slide);
      });
      for(const [cls,text] of [['prev','❮'],['next','❯']]){const button=el('button','slider-btn '+cls,text);stage.append(button);}
      const dots=el('div','slider-dots'),wrap=el('div','slider-thumbs-wrap'),thumbs=el('div','slider-thumbs');
      items.forEach((value,i)=>{const thumb=el('button','slider-thumb-btn');thumb.append(portfolioImage(value,category.title+' '+(i+1)));thumbs.append(thumb);});
      wrap.append(thumbs);slider.append(stage,dots,wrap);section.append(slider,grid);
      const api=initPortfolioCarousel(slider,'.img-slide');carousels.push({root:slider,api});
      const syncSlides=()=>stage.querySelectorAll('.img-slide').forEach(s=>{const active=s.classList.contains('active');s.setAttribute('aria-hidden',String(!active));s.querySelector('button').tabIndex=active?0:-1;});
      slider.addEventListener('portfolio-view',syncSlides);syncSlides();
      stage.addEventListener('keydown',e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();stage.querySelector(e.key==='ArrowLeft'?'.prev':'.next').click();}});
      section.syncMode=()=>{grid.hidden=!gridMode;slider.hidden=gridMode;toggle.textContent=gridMode?'슬라이드로 보기':'격자로 보기';toggle.setAttribute('aria-pressed',String(gridMode));};
      toggle.addEventListener('click',()=>{gridMode=!gridMode;for(const s of content.children)s.syncMode?.();resizeCarousels();});
      section.syncMode();
    });
    wireTabs(tabs,index=>{
      [...content.children].forEach((s,i)=>{s.hidden=i!==index;s.classList.toggle('active',i===index);});
      resizeCarousels();
      const selected=tabs.children[index];
      tabs.scrollTo({left:selected.offsetLeft-tabs.offsetLeft-(tabs.clientWidth-selected.offsetWidth)/2,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
    });
  }
  buildPortfolio(data.images);
  document.querySelectorAll('details').forEach(d=>d.addEventListener('toggle',resizeCarousels));
  window.addEventListener('resize',resizeCarousels);
})();
