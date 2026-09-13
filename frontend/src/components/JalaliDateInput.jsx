import {useEffect,useId,useRef,useState} from 'react';
import {jalaliDaysInMonth,toGregorian,toJalali,todayJalali} from '../jalali';

const months=['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند'];
const weekdays=['ش','ی','د','س','چ','پ','ج'];
const pad=n=>String(n).padStart(2,'0');
function parts(value){const source=value?toJalali(value):todayJalali();const [year,month,day]=String(source).split('/').map(Number);return {year,month,day}}
function moveMonth(year,month,delta){let nextMonth=month+delta,nextYear=year;while(nextMonth>12){nextMonth-=12;nextYear++}while(nextMonth<1){nextMonth+=12;nextYear--}return {year:nextYear,month:nextMonth}}

export default function JalaliDateInput({value,onChange,label,required=false,disabled=false}){
  const initial=parts(value),[open,setOpen]=useState(false),[view,setView]=useState({year:initial.year,month:initial.month}),root=useRef(null),trigger=useRef(null),calendarId=useId();
  const shown=value?toJalali(value):'';
  useEffect(()=>{if(!open){const p=parts(value);setView({year:p.year,month:p.month})}},[value,open]);
  const closeCalendar=(restoreFocus=false)=>{setOpen(false);if(restoreFocus)setTimeout(()=>trigger.current?.focus(),0)};
  useEffect(()=>{const close=e=>{if(root.current&&!root.current.contains(e.target))closeCalendar(false)};document.addEventListener('mousedown',close);return ()=>document.removeEventListener('mousedown',close)},[]);
  useEffect(()=>{if(!open)return;const key=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();closeCalendar(true)}};document.addEventListener('keydown',key,true);return ()=>document.removeEventListener('keydown',key,true)},[open]);
  const first=toGregorian(`${view.year}/${pad(view.month)}/01`),offset=(new Date(`${first}T12:00:00`).getDay()+1)%7,days=jalaliDaysInMonth(view.year,view.month),selected=value?parts(value):null,today=parts('');
  const choose=day=>{onChange(toGregorian(`${view.year}/${pad(view.month)}/${pad(day)}`));closeCalendar(true)};
  const previous=()=>setView(v=>moveMonth(v.year,v.month,-1)),next=()=>setView(v=>moveMonth(v.year,v.month,1));
  return <label className="field jalali-date-field" ref={root}><span>{label}{required?' *':''}</span><button ref={trigger} type="button" className="jalali-date-trigger" onClick={()=>!disabled&&setOpen(x=>!x)} disabled={disabled} aria-haspopup="dialog" aria-expanded={open} aria-controls={calendarId}><span className={shown?'':'date-placeholder'}>{shown||'انتخاب تاریخ'}</span><span className="date-icon" aria-hidden="true">▣</span></button>{open&&<div id={calendarId} className="jalali-calendar" role="dialog" aria-label={`تقویم ${label}`}><div className="calendar-head"><button type="button" onClick={next} aria-label="ماه بعد">›</button><strong>{months[view.month-1]} {view.year}</strong><button type="button" onClick={previous} aria-label="ماه قبل">‹</button></div><div className="calendar-weekdays">{weekdays.map(d=><span key={d}>{d}</span>)}</div><div className="calendar-days">{Array.from({length:offset}).map((_,i)=><i key={`blank-${i}`} />)}{Array.from({length:days},(_,i)=>{const day=i+1,isSelected=selected&&selected.year===view.year&&selected.month===view.month&&selected.day===day;return <button type="button" key={day} className={`${isSelected?'selected ':''}${today.year===view.year&&today.month===view.month&&today.day===day?'today':''}`} onClick={()=>choose(day)} aria-label={`${day} ${months[view.month-1]} ${view.year}`} aria-pressed={isSelected}>{day}</button>})}</div><div className="calendar-actions"><button type="button" onClick={()=>{const p=parts('');setView({year:p.year,month:p.month});onChange(toGregorian(`${p.year}/${pad(p.month)}/${pad(p.day)}`));closeCalendar(true)}}>امروز</button>{value&&<button type="button" onClick={()=>{onChange('');closeCalendar(true)}}>پاک کردن</button>}</div></div>}<small>{shown?'برای تغییر، روی تاریخ کلیک کنید.':'روز موردنظر را از تقویم انتخاب کنید.'}</small></label>
}
