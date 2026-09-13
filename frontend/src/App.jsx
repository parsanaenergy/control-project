import {useState} from 'react';
import {LayoutDashboard,FolderKanban,Users,ClipboardPlus,GanttChart,ShoppingCart,Factory,ShieldCheck,CreditCard,Truck,FileBarChart} from 'lucide-react';
import Dashboard from './pages/Dashboard';
import Projects from './pages/Projects';
import Customers from './pages/Customers';
import Orders from './pages/Orders';
import ProjectControl from './pages/ProjectControl';
import Department from './pages/Department';
import QualityControl from './pages/QualityControl';
import Payments from './pages/Payments';
import Shipments from './pages/Shipments';
import Reports from './pages/Reports';
import AppErrorBoundary from './components/AppErrorBoundary';

const navigation=[
  {label:'مدیریت',items:[['dashboard','داشبورد',LayoutDashboard],['projects','پروژه‌ها',FolderKanban],['reports','گزارش‌ها',FileBarChart]]},
  {label:'سفارش و عملیات',items:[['customers','مشتریان',Users],['orders','ثبت سفارش',ClipboardPlus],['control','کنترل پروژه',GanttChart],['purchase','خرید',ShoppingCart],['production','تولید',Factory],['qc','کنترل کیفیت (QC)',ShieldCheck]]},
  {label:'مالی و ارسال',items:[['payments','پرداخت‌ها',CreditCard],['shipments','ارسال',Truck]]}
];

export default function App(){
  const [page,setPage]=useState('dashboard'),[context,setContext]=useState({});
  const navigate=(next,nextContext={})=>{setContext(nextContext);setPage(next)};
  const backToReports=()=>navigate('reports');
  const content=page==='dashboard'?<Dashboard onNavigate={navigate}/>:page==='projects'?<Projects onNavigate={navigate} initialProjectId={context.projectId}/>:page==='reports'?<Reports onNavigate={navigate} initialOrderId={context.orderId} initialProductId={context.productId}/>:page==='customers'?<Customers onNavigate={navigate}/>:page==='orders'?<Orders onNavigate={navigate} initialCustomerId={context.customerId} initialProjectId={context.projectId}/>:page==='control'?<ProjectControl initialOrderId={context.orderId} initialProductId={context.productId} onBack={context.fromReport?backToReports:undefined}/>:page==='purchase'?<Department type="PURCHASE" title="خرید" initialOrderId={context.orderId} initialProductId={context.productId} onBack={context.fromReport?backToReports:undefined}/>:page==='production'?<Department type="PRODUCTION" title="تولید" initialOrderId={context.orderId} initialProductId={context.productId} onBack={context.fromReport?backToReports:undefined}/>:page==='qc'?<QualityControl onNavigate={navigate} initialOrderId={context.orderId} initialProductId={context.productId}/>:page==='payments'?<Payments onNavigate={navigate}/>:<Shipments onNavigate={navigate}/>;
  return <div className="app"><aside className="sidebar no-print"><div className="brand"><b>مدیریت کارخانه</b></div><nav>{navigation.map(group=><section className="nav-group" key={group.label}><span>{group.label}</span>{group.items.map(([key,label,Icon])=><button key={key} title={label} aria-label={label} className={page===key?'active':''} onClick={()=>navigate(key)}><Icon size={18}/><span>{label}</span></button>)}</section>)}</nav><div className="side-foot">omid edalati</div></aside><AppErrorBoundary><main className="app-main">{content}</main></AppErrorBoundary></div>
}
