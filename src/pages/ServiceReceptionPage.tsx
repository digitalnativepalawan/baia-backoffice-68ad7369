import ServiceBoard from '@/components/service/ServiceBoard';
import ServiceHeader from '@/components/service/ServiceHeader';

const ServiceReceptionPage = () => (
  <div className="h-screen flex flex-col bg-navy-texture overflow-hidden">
    <ServiceHeader department="reception" />
    <ServiceBoard department="reception" />
  </div>
);

export default ServiceReceptionPage;
