"""Run after model_crane_ship.py in the same Blender namespace."""
ship=empty('CargoShip',(0,9,0))
# Faceted tapered displacement hull, with pointed bow and a flat working deck.
outline=[(-7,-1.65),(-6.4,-2.05),(4.8,-2.05),(6.4,-1.35),(7.5,0),(6.4,1.35),(4.8,2.05),(-6.4,2.05),(-7,1.65)]
verts=[(x*.93,y*.65,.08) for x,y in outline]+[(x,y,1.35) for x,y in outline]
n=len(outline); faces=[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
mesh=bpy.data.meshes.new('HullMesh'); mesh.from_pydata(verts,[],faces); mesh.update()
o=bpy.data.objects.new('CargoShip_Hull',mesh); scene.collection.objects.link(o); finish(o,'CargoShip_Hull',teal,ship)
box('OpenCargoDeck',(-.3,0,1.39),(11.8,3.85,.12),deckmat,ship)
for sign in [-1,1]:
 y=sign*2.04
 box('Gunwale',(-.8,y,1.48),(11.3,.13,.23),white,ship)
 for x in [-5.7,-4.2,-2.7,-1.2,.3,1.8,3.3,4.8]:
  rod('RailingPost',(x,y,1.57),(x,y,2.1),.028,white,ship)
 for z in [1.83,2.1]: rod('SideRailing',(-5.7,y,z),(4.8,y,z),.025,white,ship)
 for x in [-5,-2,1,4]:
  cyl('RubberFender',(x,y*1.035,1.0),.27,.17,rubber,ship,'Y')
  rod('FenderRope',(x,y,1.55),(x,y*1.035,1.05),.018,wood,ship)
 for x in [-5.8,5.4]:
  cyl('Bollard',(x,sign*1.25,1.64),.09,.38,dark,ship)
  rod('BollardCross',(x-.2,sign*1.25,1.77),(x+.2,sign*1.25,1.77),.045,dark,ship)
box('SternCabin',(-5.5,0,2.05),(2.1,2.9,1.25),white,ship,.09)
box('Wheelhouse',(-5.45,0,3.05),(2.25,2.7,1.0),white,ship,.08)
box('WheelhouseRoof',(-5.45,0,3.61),(2.55,3.05,.16),teal,ship)
for y in [-.88,0,.88]: box('BridgeFrontWindow',(-4.315,y,3.13),(.025,.71,.57),glass,ship)
for sign in [-1,1]:
 for x in [-6.03,-4.92]: box('BridgeSideWindow',(x,sign*1.36,3.13),(.85,.025,.57),glass,ship)
 box('CabinDoor',(-5.7,sign*1.46,2.02),(.67,.035,1.02),teal,ship)
 cyl('LifeRing',(-4.97,sign*1.49,2.15),.25,.07,red,ship,'Y')
 cyl('LifeRingCenter',(-4.97,sign*1.535,2.15),.15,.02,white,ship,'Y')
cyl('Exhaust',(-6.12,.7,3.98),.12,.65,dark,ship)
rod('Mast',(-5.1,0,3.7),(-5.1,0,5.1),.05,white,ship)
rod('MastCross',(-5.1,-.7,4.65),(-5.1,.7,4.65),.035,white,ship)
box('Radar',(-5.1,0,5.06),(.2,1.1,.12),white,ship)
for y,m in [(-.7,red),(.7,teal)]: cyl('NavigationLight',(-5.1,y,4.73),.075,.12,m,ship)
for x,y in [(5.7,-.9),(5.7,.9)]:
 rod('BowRailPost',(x,y,1.4),(x,y,2.0),.028,white,ship)
curve('BowRail',[(4.8,-2.04,2.1),(6.4,-1.35,2.1),(7.25,0,2.1),(6.4,1.35,2.1),(4.8,2.04,2.1)],.028,white,ship)
crates=[]
for i,(x,y) in enumerate([(-2.6,-.9),(-.4,-.9),(1.8,-.9),(-1.5,.9),(1,.9)]):
 root=empty('Cargo_'+str(i+1),(x,y,1.46),ship); crates.append(root)
 box('CrateBody',(0,0,.55),(1.25,1.2,1.1),wood,root)
 for sx in [-.52,.52]:
  for sy in [-.61,.61]: box('CrateCorner',(sx,sy,.55),(.13,.05,1.13),yellow,root)
 for z in [.12,.99]:
  box('CrateStrapX',(0,0,z),(1.29,1.24,.06),dark,root,.01)
 for sx in [-.42,.42]: box('PalletFoot',(sx,0,-.035),(.18,1.2,.07),dark,root,.01)
 cyl('LiftingSocket',(0,0,1.14),.13,.08,steel,root)
 empty('A_GrabPoint',(0,0,1.22),root)
 root['grabbable']=True; root['grab_radius_m']=.35
print('Ship built',len(list(ship.children_recursive)))
