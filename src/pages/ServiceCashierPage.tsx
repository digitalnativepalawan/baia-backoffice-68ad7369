import ServiceHeader from '@/components/service/ServiceHeader';
import CashierBoard from '@/components/service/CashierBoard';

const ServiceCashierPage = () => (
  <div className="h-screen flex flex-col bg-navy-texture overflow-hidden">
    <ServiceHeader department="reception" />
    <CashierBoard />
  </div>
);

export default ServiceCashierPage;
