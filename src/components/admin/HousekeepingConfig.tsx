import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { Plus, Trash2, GripVertical, Copy, Package, ClipboardList, Home } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const HousekeepingConfig = () => {
  const qc = useQueryClient();

  // ── Room Types ──
  const { data: roomTypes = [] } = useQuery({
    queryKey: ['room-types'],
    queryFn: async () => {
      const { data } = await supabase.from('room_types').select('*').order('name');
      return data || [];
    },
  });

  const { data: units = [] } = useQuery({
    queryKey: ['units-admin'],
    queryFn: async () => {
      const { data } = await supabase.from('units').select('*').order('unit_name');
      return data || [];
    },
  });

  // ── Checklists ──
  const { data: checklists = [] } = useQuery({
    queryKey: ['housekeeping-checklists'],
    queryFn: async () => {
      const { data } = await supabase.from('housekeeping_checklists').select('*').order('sort_order');
      return data || [];
    },
  });

  // ── Cleaning Packages + Items ──
  const { data: packages = [] } = useQuery({
    queryKey: ['cleaning-packages'],
    queryFn: async () => {
      const { data } = await supabase.from('cleaning_packages').select('*').order('name');
      return data || [];
    },
  });

  const { data: packageItems = [] } = useQuery({
    queryKey: ['cleaning-package-items'],
    queryFn: async () => {
      const { data } = await supabase.from('cleaning_package_items').select('*');
      return data || [];
    },
  });

  const { data: ingredients = [] } = useQuery({
    queryKey: ['ingredients'],
    queryFn: async () => {
      const { data } = await supabase.from('ingredients').select('*').order('name');
      return data || [];
    },
  });

  // ── Room Types State ──
  const [newRoomType, setNewRoomType] = useState('');

  const addRoomType = async () => {
    if (!newRoomType.trim()) return;
    await supabase.from('room_types').insert({ name: newRoomType.trim() });
    setNewRoomType('');
    qc.invalidateQueries({ queryKey: ['room-types'] });
    toast.success('Room type added');
  };

  const deleteRoomType = async (id: string) => {
    await supabase.from('room_types').delete().eq('id', id);
    qc.invalidateQueries({ queryKey: ['room-types'] });
    toast.success('Room type deleted');
  };

  const assignRoomType = async (unitId: string, roomTypeId: string | null) => {
    await supabase.from('units').update({ room_type_id: roomTypeId } as any).eq('id', unitId);
    qc.invalidateQueries({ queryKey: ['units-admin'] });
    toast.success('Room type assigned');
  };

  // ── Checklists State ──
  const [selectedChecklistType, setSelectedChecklistType] = useState<string>('');
  const [newItemLabel, setNewItemLabel] = useState('');
  const [newItemRequired, setNewItemRequired] = useState(true);
  const [newItemCount, setNewItemCount] = useState('');

  const activeChecklistTypeId = selectedChecklistType || (roomTypes.length > 0 ? roomTypes[0].id : '');
  const filteredChecklist = checklists.filter((c: any) => c.room_type_id === activeChecklistTypeId);

  const addChecklistItem = async () => {
    if (!newItemLabel.trim() || !activeChecklistTypeId) return;
    const maxSort = filteredChecklist.reduce((m: number, c: any) => Math.max(m, c.sort_order || 0), 0);
    await supabase.from('housekeeping_checklists').insert({
      room_type_id: activeChecklistTypeId,
      item_label: newItemLabel.trim(),
      is_required: newItemRequired,
      count_expected: newItemCount ? parseInt(newItemCount) : null,
      sort_order: maxSort + 1,
    });
    setNewItemLabel('');
    setNewItemCount('');
    setNewItemRequired(true);
    qc.invalidateQueries({ queryKey: ['housekeeping-checklists'] });
    toast.success('Checklist item added');
  };

  const deleteChecklistItem = async (id: string) => {
    await supabase.from('housekeeping_checklists').delete().eq('id', id);
    qc.invalidateQueries({ queryKey: ['housekeeping-checklists'] });
    toast.success('Checklist item deleted');
  };

  // ── Cleaning Packages State ──
  const [selectedPackageType, setSelectedPackageType] = useState<string>('');
  const [newPackageName, setNewPackageName] = useState('');
  const [editingPackageId, setEditingPackageId] = useState<string | null>(null);
  const [addIngredientId, setAddIngredientId] = useState('');
  const [addIngredientQty, setAddIngredientQty] = useState('');

  const activePackageTypeId = selectedPackageType || (roomTypes.length > 0 ? roomTypes[0].id : '');
  const filteredPackages = packages.filter((p: any) => p.room_type_id === activePackageTypeId);

  const addPackage = async () => {
    if (!newPackageName.trim() || !activePackageTypeId) return;
    await supabase.from('cleaning_packages').insert({
      room_type_id: activePackageTypeId,
      name: newPackageName.trim(),
    });
    setNewPackageName('');
    qc.invalidateQueries({ queryKey: ['cleaning-packages'] });
    toast.success('Package created');
  };

  const deletePackage = async (id: string) => {
    await supabase.from('cleaning_packages').delete().eq('id', id);
    qc.invalidateQueries({ queryKey: ['cleaning-packages'] });
    toast.success('Package deleted');
  };

  const duplicatePackage = async (pkg: any) => {
    const { data: newPkg } = await supabase.from('cleaning_packages').insert({
      room_type_id: pkg.room_type_id,
      name: `${pkg.name} (Copy)`,
    }).select().single();
    if (newPkg) {
      const items = packageItems.filter((pi: any) => pi.package_id === pkg.id);
      for (const item of items) {
        await supabase.from('cleaning_package_items').insert({
          package_id: newPkg.id,
          ingredient_id: item.ingredient_id,
          default_quantity: item.default_quantity,
        });
      }
    }
    qc.invalidateQueries({ queryKey: ['cleaning-packages', 'cleaning-package-items'] });
    toast.success('Package duplicated');
  };

  const addPackageItem = async (packageId: string) => {
    if (!addIngredientId || !addIngredientQty) return;
    await supabase.from('cleaning_package_items').insert({
      package_id: packageId,
      ingredient_id: addIngredientId,
      default_quantity: parseFloat(addIngredientQty) || 0,
    });
    setAddIngredientId('');
    setAddIngredientQty('');
    qc.invalidateQueries({ queryKey: ['cleaning-package-items'] });
    toast.success('Supply added');
  };

  const deletePackageItem = async (id: string) => {
    await supabase.from('cleaning_package_items').delete().eq('id', id);
    qc.invalidateQueries({ queryKey: ['cleaning-package-items'] });
    toast.success('Supply removed');
  };

  const updatePackageItemQty = async (id: string, qty: number) => {
    await supabase.from('cleaning_package_items').update({ default_quantity: qty }).eq('id', id);
    qc.invalidateQueries({ queryKey: ['cleaning-package-items'] });
  };

  const getIngredientName = (id: string) => {
    const ing = ingredients.find((i: any) => i.id === id);
    return ing ? `${ing.name} (${ing.unit})` : 'Unknown';
  };

  const getRoomTypeName = (id: string) => {
    const rt = roomTypes.find((r: any) => r.id === id);
    return rt?.name || '';
  };

  return (
    <section>
      <h3 className="font-display text-sm tracking-wider text-foreground mb-4 flex items-center gap-2">
        <Home className="w-4 h-4" /> Housekeeping Configuration
      </h3>

      <Tabs defaultValue="room-types" className="w-full">
        <TabsList className="w-full bg-secondary mb-4">
          <TabsTrigger value="room-types" className="font-display text-xs tracking-wider flex-1 min-h-[40px]">Room Types</TabsTrigger>
          <TabsTrigger value="checklists" className="font-display text-xs tracking-wider flex-1 min-h-[40px]">Checklists</TabsTrigger>
          <TabsTrigger value="packages" className="font-display text-xs tracking-wider flex-1 min-h-[40px]">Packages</TabsTrigger>
        </TabsList>

        {/* ── Room Types ── */}
        <TabsContent value="room-types" className="space-y-4">
          <div className="space-y-2">
            {roomTypes.map((rt: any) => (
              <div key={rt.id} className="flex items-center justify-between border border-border rounded-lg p-3">
                <span className="font-body text-sm text-foreground">{rt.name}</span>
                <Button variant="ghost" size="icon" onClick={() => deleteRoomType(rt.id)} className="text-destructive h-8 w-8">
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
            <div className="flex gap-2">
              <Input value={newRoomType} onChange={e => setNewRoomType(e.target.value)} placeholder="New room type (e.g. Suite)"
                className="bg-secondary border-border text-foreground font-body" onKeyDown={e => e.key === 'Enter' && addRoomType()} />
              <Button onClick={addRoomType} size="icon" variant="outline"><Plus className="w-4 h-4" /></Button>
            </div>
          </div>

          {roomTypes.length > 0 && (
            <div className="space-y-2 pt-4 border-t border-border">
              <h4 className="font-display text-xs tracking-wider text-muted-foreground">Assign Room Types to Units</h4>
              {units.map((u: any) => (
                <div key={u.id} className="flex items-center justify-between gap-2">
                  <span className="font-body text-sm text-foreground truncate flex-1">{u.unit_name}</span>
                  <Select value={(u as any).room_type_id || 'none'} onValueChange={v => assignRoomType(u.id, v === 'none' ? null : v)}>
                    <SelectTrigger className="bg-secondary border-border text-foreground font-body text-xs h-8 w-40">
                      <SelectValue placeholder="No type" />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border">
                      <SelectItem value="none" className="text-muted-foreground font-body text-xs">No type</SelectItem>
                      {roomTypes.map((rt: any) => (
                        <SelectItem key={rt.id} value={rt.id} className="text-foreground font-body text-xs">{rt.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── Inspection Checklists ── */}
        <TabsContent value="checklists" className="space-y-4">
          {roomTypes.length === 0 ? (
            <p className="font-body text-xs text-muted-foreground">Add room types first.</p>
          ) : (
            <>
              <Select value={activeChecklistTypeId} onValueChange={setSelectedChecklistType}>
                <SelectTrigger className="bg-secondary border-border text-foreground font-body">
                  <SelectValue placeholder="Select room type" />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {roomTypes.map((rt: any) => (
                    <SelectItem key={rt.id} value={rt.id} className="text-foreground font-body text-xs">{rt.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="space-y-1">
                {filteredChecklist.map((item: any) => (
                  <div key={item.id} className="flex items-center gap-2 border border-border rounded p-2">
                    <GripVertical className="w-3 h-3 text-muted-foreground shrink-0" />
                    <span className="font-body text-sm text-foreground flex-1">{item.item_label}</span>
                    {item.is_required && <span className="text-[10px] text-amber-400 font-display">REQ</span>}
                    {item.count_expected && <span className="text-[10px] text-muted-foreground font-body">×{item.count_expected}</span>}
                    <Button variant="ghost" size="icon" onClick={() => deleteChecklistItem(item.id)} className="text-destructive h-6 w-6">
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
              </div>

              <div className="space-y-2 border border-border rounded-lg p-3">
                <Input value={newItemLabel} onChange={e => setNewItemLabel(e.target.value)} placeholder="Checklist item label (e.g. TV - Working)"
                  className="bg-secondary border-border text-foreground font-body" />
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2">
                    <Checkbox checked={newItemRequired} onCheckedChange={v => setNewItemRequired(!!v)} />
                    <span className="font-body text-xs text-muted-foreground">Required</span>
                  </label>
                  <Input value={newItemCount} onChange={e => setNewItemCount(e.target.value)} placeholder="Expected count"
                    className="bg-secondary border-border text-foreground font-body h-8 w-24" type="number" />
                </div>
                <Button onClick={addChecklistItem} variant="outline" className="w-full font-display text-xs tracking-wider">
                  <Plus className="w-3 h-3 mr-1" /> Add Item
                </Button>
              </div>
            </>
          )}
        </TabsContent>

        {/* ── Cleaning Packages ── */}
        <TabsContent value="packages" className="space-y-4">
          {roomTypes.length === 0 ? (
            <p className="font-body text-xs text-muted-foreground">Add room types first.</p>
          ) : (
            <>
              <Select value={activePackageTypeId} onValueChange={setSelectedPackageType}>
                <SelectTrigger className="bg-secondary border-border text-foreground font-body">
                  <SelectValue placeholder="Select room type" />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {roomTypes.map((rt: any) => (
                    <SelectItem key={rt.id} value={rt.id} className="text-foreground font-body text-xs">{rt.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {filteredPackages.map((pkg: any) => {
                const items = packageItems.filter((pi: any) => pi.package_id === pkg.id);
                const isEditing = editingPackageId === pkg.id;
                return (
                  <div key={pkg.id} className="border border-border rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-display text-sm text-foreground tracking-wider">{pkg.name}</span>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => duplicatePackage(pkg)} className="h-7 w-7">
                          <Copy className="w-3 h-3" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => setEditingPackageId(isEditing ? null : pkg.id)} className="h-7 w-7">
                          <ClipboardList className="w-3 h-3" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => deletePackage(pkg.id)} className="text-destructive h-7 w-7">
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>

                    {items.map((pi: any) => (
                      <div key={pi.id} className="flex items-center gap-2 pl-2">
                        <span className="font-body text-xs text-muted-foreground flex-1">{getIngredientName(pi.ingredient_id)}</span>
                        <Input
                          type="number"
                          value={pi.default_quantity}
                          onChange={e => updatePackageItemQty(pi.id, parseFloat(e.target.value) || 0)}
                          className="bg-secondary border-border text-foreground font-body h-7 w-20 text-xs"
                        />
                        <Button variant="ghost" size="icon" onClick={() => deletePackageItem(pi.id)} className="text-destructive h-6 w-6">
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    ))}

                    {isEditing && (
                      <div className="flex gap-2 pt-2 border-t border-border/50">
                        <Select value={addIngredientId} onValueChange={setAddIngredientId}>
                          <SelectTrigger className="bg-secondary border-border text-foreground font-body text-xs h-8 flex-1">
                            <SelectValue placeholder="Select supply" />
                          </SelectTrigger>
                          <SelectContent className="bg-card border-border max-h-48">
                            {ingredients.map((ing: any) => (
                              <SelectItem key={ing.id} value={ing.id} className="text-foreground font-body text-xs">
                                {ing.name} ({ing.unit})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input type="number" value={addIngredientQty} onChange={e => setAddIngredientQty(e.target.value)}
                          placeholder="Qty" className="bg-secondary border-border text-foreground font-body h-8 w-20 text-xs" />
                        <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => addPackageItem(pkg.id)}>
                          <Plus className="w-3 h-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}

              <div className="flex gap-2">
                <Input value={newPackageName} onChange={e => setNewPackageName(e.target.value)} placeholder="New package name (e.g. Deep Clean)"
                  className="bg-secondary border-border text-foreground font-body" onKeyDown={e => e.key === 'Enter' && addPackage()} />
                <Button onClick={addPackage} size="icon" variant="outline"><Plus className="w-4 h-4" /></Button>
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>
    </section>
  );
};

export default HousekeepingConfig;
