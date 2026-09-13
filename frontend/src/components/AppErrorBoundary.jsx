import {Component} from 'react';

export default class AppErrorBoundary extends Component{
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true}}
  componentDidCatch(error){console.error('UI render failure',error)}
  retry=()=>this.setState({failed:false});
  render(){if(this.state.failed)return <main className="app-recovery"><div><span>خطای نمایش</span><h1>این بخش درست بارگذاری نشد</h1><p>اطلاعات ثبت‌شده حذف نشده‌اند. صفحه را دوباره بارگذاری کنید یا به داشبورد برگردید.</p><section><button onClick={this.retry}>تلاش دوباره</button><button className="secondary" onClick={()=>window.location.reload()}>بارگذاری مجدد صفحه</button></section></div></main>;return this.props.children}
}
