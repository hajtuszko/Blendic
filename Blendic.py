bl_info = {
    "name": "Blendic",
    "author": "PatrykGPT",
    "version": (1, 0, 1),
    "blender": (4, 4, 0),
    "location": "3D Viewport > Sidebar > Blendic",
    "description": "Automatycznie aktualizuje obraz w UV Editorze na podstawie materiału wybranej powierzchni",
    "category": "Mesh",
}

import bpy
from bpy.types import Panel, Operator, AddonPreferences
from bpy.props import StringProperty
from bpy.app.handlers import persistent
import bmesh
import os
import urllib.request
import urllib.error
import json
import tempfile
import shutil
import zipfile

# Globalne zmienne do śledzenia stanu
is_updating = False
previous_selection_state = None

# URL do sprawdzania aktualizacji (zmień na swój)
UPDATE_URL = "https://raw.githubusercontent.com/hajtuszko/blendic/main/version.json"
DOWNLOAD_URL = "https://github.com/hajtuszko/blendic/archive/main.zip"

class BlendICPreferences(AddonPreferences):
    """Preferencje addon-a"""
    bl_idname = __name__
    
    update_url: StringProperty(
        name="Update URL",
        description="URL do sprawdzania aktualizacji",
        default=UPDATE_URL,
    )
    
    download_url: StringProperty(
        name="Download URL", 
        description="URL do pobierania aktualizacji",
        default=DOWNLOAD_URL,
    )
    
    def draw(self, context):
        layout = self.layout
        
        box = layout.box()
        box.label(text="Aktualizacje:", icon='WORLD')
        box.prop(self, "update_url", text="URL wersji")
        box.prop(self, "download_url", text="URL pobierania")
        
        row = box.row()
        row.operator("blendic.check_update", text="Sprawdź aktualizacje", icon='FILE_REFRESH')
        row.operator("blendic.update_addon", text="Aktualizuj", icon='IMPORT')
        
        box.separator()
        current_version = ".".join(map(str, bl_info["version"]))
        box.label(text=f"Aktualna wersja: {current_version}")

class BLENDIC_OT_check_update(Operator):
    """Sprawdź dostępność aktualizacji"""
    bl_idname = "blendic.check_update"
    bl_label = "Sprawdź aktualizacje"
    bl_description = "Sprawdź czy dostępna jest nowsza wersja"
    
    def execute(self, context):
        prefs = context.preferences.addons[__name__].preferences
        
        try:
            with urllib.request.urlopen(prefs.update_url, timeout=10) as response:
                data = json.loads(response.read().decode())
                
                remote_version = tuple(data.get("version", [0, 0, 0]))
                current_version = bl_info["version"]
                
                if remote_version > current_version:
                    self.report({'INFO'}, 
                        f"Dostępna aktualizacja: v{'.'.join(map(str, remote_version))} "
                        f"(aktualna: v{'.'.join(map(str, current_version))})")
                else:
                    self.report({'INFO'}, "Masz najnowszą wersję!")
                    
        except urllib.error.URLError:
            self.report({'ERROR'}, "Nie można połączyć z serwerem aktualizacji")
        except json.JSONDecodeError:
            self.report({'ERROR'}, "Błędna odpowiedź serwera")
        except Exception as e:
            self.report({'ERROR'}, f"Błąd sprawdzania aktualizacji: {str(e)}")
            
        return {'FINISHED'}

class BLENDIC_OT_update_addon(Operator):
    """Aktualizuj addon"""
    bl_idname = "blendic.update_addon"
    bl_label = "Aktualizuj Blendic"
    bl_description = "Pobierz i zainstaluj najnowszą wersję"
    
    def execute(self, context):
        prefs = context.preferences.addons[__name__].preferences
        
        try:
            # Sprawdź wersję
            with urllib.request.urlopen(prefs.update_url, timeout=10) as response:
                data = json.loads(response.read().decode())
                remote_version = tuple(data.get("version", [0, 0, 0]))
                current_version = bl_info["version"]
                
                if remote_version <= current_version:
                    self.report({'INFO'}, "Masz już najnowszą wersję!")
                    return {'FINISHED'}
            
            # Pobierz nową wersję
            self.report({'INFO'}, "Pobieranie aktualizacji...")
            
            with tempfile.TemporaryDirectory() as temp_dir:
                zip_path = os.path.join(temp_dir, "blendic_update.zip")
                
                # Pobierz plik
                urllib.request.urlretrieve(prefs.download_url, zip_path)
                
                # Rozpakuj
                extract_dir = os.path.join(temp_dir, "extracted")
                with zipfile.ZipFile(zip_path, 'r') as zip_ref:
                    zip_ref.extractall(extract_dir)
                
                # Znajdź folder z pluginem
                plugin_source = None
                for root, dirs, files in os.walk(extract_dir):
                    if "__init__.py" in files:
                        # Sprawdź czy to nasz plugin
                        init_path = os.path.join(root, "__init__.py")
                        with open(init_path, 'r', encoding='utf-8') as f:
                            content = f.read()
                            if 'bl_info' in content and 'Blendic' in content:
                                plugin_source = root
                                break
                
                if not plugin_source:
                    self.report({'ERROR'}, "Nie znaleziono plików pluginu w archiwum")
                    return {'FINISHED'}
                
                # Znajdź miejsce instalacji obecnego addonu
                addon_dir = os.path.dirname(os.path.realpath(__file__))
                
                # Wyłącz addon
                bpy.ops.preferences.addon_disable(module=__name__)
                
                # Skopiuj nowe pliki
                for item in os.listdir(plugin_source):
                    src_path = os.path.join(plugin_source, item)
                    dst_path = os.path.join(addon_dir, item)
                    
                    if os.path.isfile(src_path):
                        shutil.copy2(src_path, dst_path)
                    elif os.path.isdir(src_path):
                        if os.path.exists(dst_path):
                            shutil.rmtree(dst_path)
                        shutil.copytree(src_path, dst_path)
                
                # Włącz addon ponownie
                bpy.ops.preferences.addon_enable(module=__name__)
                
                self.report({'INFO'}, 
                    f"Aktualizacja zakończona! Zaktualizowano do wersji "
                    f"{'.'.join(map(str, remote_version))}")
                
        except urllib.error.URLError:
            self.report({'ERROR'}, "Nie można pobrać aktualizacji - sprawdź połączenie")
        except Exception as e:
            self.report({'ERROR'}, f"Błąd aktualizacji: {str(e)}")
            
        return {'FINISHED'}

class BLENDIC_OT_run(Operator):
    """Włącz/wyłącz automatyczne śledzenie materiałów"""
    bl_idname = "blendic.run"
    bl_label = "Run"
    bl_description = "Włącz/wyłącz automatyczne aktualizowanie obrazu w UV Editorze"
    
    def execute(self, context):
        scene = context.scene
        
        if not hasattr(scene, 'blendic_active'):
            scene.blendic_active = False
        
        # Przełącz stan aktywności
        scene.blendic_active = not scene.blendic_active
        
        if scene.blendic_active:
            self.report({'INFO'}, "Blendic aktywny - wybierz powierzchnie w trybie edycji")
        else:
            self.report({'INFO'}, "Blendic nieaktywny")
        
        return {'FINISHED'}

class BLENDIC_OT_update_image(Operator):
    """Ręczne aktualizowanie obrazu"""
    bl_idname = "blendic.update_image"
    bl_label = "Update Image"
    bl_description = "Ręcznie zaktualizuj obraz w UV Editorze dla wybranej powierzchni"
    
    def execute(self, context):
        result = assign_image_from_selected_face()
        if result:
            self.report({'INFO'}, f"Obraz '{result}' załadowany do UV Editora")
        else:
            self.report({'WARNING'}, "Nie znaleziono odpowiedniego obrazu lub powierzchni")
        return {'FINISHED'}

class BLENDIC_PT_panel(Panel):
    """Panel Blendic w sidebarze"""
    bl_label = "Blendic"
    bl_idname = "BLENDIC_PT_panel"
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category = "Blendic"
    
    def draw(self, context):
        layout = self.layout
        scene = context.scene
        
        # Sprawdź czy Blendic jest aktywny
        is_active = getattr(scene, 'blendic_active', False)
        
        row = layout.row()
        if is_active:
            row.operator("blendic.run", text="Stop", icon='PAUSE')
            layout.label(text="Status: Aktywny", icon='REC')
        else:
            row.operator("blendic.run", text="Run", icon='PLAY')
            layout.label(text="Status: Nieaktywny", icon='RADIOBUT_OFF')
        
        layout.separator()
        
        # Przycisk do ręcznego odświeżania
        layout.operator("blendic.update_image", text="Update Image", icon='FILE_REFRESH')
        
        layout.separator()
        
        # Sekcja aktualizacji
        box = layout.box()
        box.label(text="Aktualizacje:", icon='WORLD')
        row = box.row()
        row.operator("blendic.check_update", text="Sprawdź", icon='ZOOM_IN')
        row.operator("blendic.update_addon", text="Aktualizuj", icon='IMPORT')
        
        current_version = ".".join(map(str, bl_info["version"]))
        box.label(text=f"Wersja: {current_version}")
        
        layout.separator()
        layout.label(text="Instrukcje:")
        box = layout.box()
        box.label(text="1. Kliknij 'Run' aby włączyć")
        box.label(text="2. Przejdź do trybu edycji")
        box.label(text="3. Wybierz powierzchnię")
        box.label(text="4. Obraz aktualizuje się")
        box.label(text="   automatycznie")

def assign_image_from_selected_face():
    """Główna funkcja aktualizująca obraz w UV Editorze"""
    global is_updating
    
    if is_updating:
        return None
    
    obj = bpy.context.active_object
    if obj is None or obj.type != 'MESH':
        return None
    
    current_mode = bpy.context.mode
    need_mode_switch = current_mode == 'EDIT_MESH'
    
    if need_mode_switch:
        is_updating = True
        bpy.ops.object.mode_set(mode='OBJECT')
    
    try:
        mesh = obj.data
        selected_faces = [face for face in mesh.polygons if face.select]
        
        if not selected_faces:
            return None
        
        face = selected_faces[0]
        mat_index = face.material_index
        
        if mat_index >= len(obj.material_slots):
            return None
        
        material = obj.material_slots[mat_index].material
        if not material or not material.use_nodes:
            return None
        
        # Szukamy image texture podpiętego do Base Color
        for node in material.node_tree.nodes:
            if node.type == 'TEX_IMAGE' and node.image:
                for link in material.node_tree.links:
                    if (link.from_node == node and 
                        link.to_node.type == 'BSDF_PRINCIPLED' and
                        link.to_socket.name == 'Base Color'):
                        
                        # Znajdź UV Editor i ustaw obraz
                        for area in bpy.context.screen.areas:
                            if area.type == 'IMAGE_EDITOR':
                                for space in area.spaces:
                                    if space.type == 'IMAGE_EDITOR':
                                        space.image = node.image
                                        break
                        
                        return node.image.name
        
        return None
    
    finally:
        if need_mode_switch:
            bpy.ops.object.mode_set(mode='EDIT')
            is_updating = False

# Timer do sprawdzania zmian selekcji
def check_selection_timer():
    """Timer sprawdzający zmiany w selekcji"""
    global previous_selection_state
    
    scene = bpy.context.scene
    if not getattr(scene, 'blendic_active', False):
        return 1.0  # Sprawdzaj co sekundę gdy nieaktywny
    
    context = bpy.context
    if (context.active_object and 
        context.active_object.type == 'MESH' and 
        context.mode == 'EDIT_MESH' and
        not is_updating):
        
        obj = context.active_object
        
        # Użyj bmesh do sprawdzenia selekcji bez zmiany trybu
        bm = bmesh.from_edit_mesh(obj.data)
        
        # Sprawdź które materiały są wybrane
        selected_materials = set()
        for face in bm.faces:
            if face.select:
                selected_materials.add(face.material_index)
        
        current_state = tuple(sorted(selected_materials))
        
        # Sprawdź czy selekcja się zmieniła
        if current_state != previous_selection_state and current_state:
            previous_selection_state = current_state
            assign_image_from_selected_face()
    
    return 0.1  # Sprawdzaj co 100ms gdy aktywny

# Timer handler
timer_registered = False

def register_timer():
    global timer_registered
    if not timer_registered:
        bpy.app.timers.register(check_selection_timer, persistent=True)
        timer_registered = True

def unregister_timer():
    global timer_registered
    if timer_registered:
        if bpy.app.timers.is_registered(check_selection_timer):
            bpy.app.timers.unregister(check_selection_timer)
        timer_registered = False

classes = [
    BlendICPreferences,
    BLENDIC_OT_check_update,
    BLENDIC_OT_update_addon,
    BLENDIC_OT_run,
    BLENDIC_OT_update_image,
    BLENDIC_PT_panel,
]

def register():
    for cls in classes:
        bpy.utils.register_class(cls)
    
    # Dodaj właściwość do sceny
    bpy.types.Scene.blendic_active = bpy.props.BoolProperty(
        name="Blendic Active",
        description="Czy Blendic jest aktywny",
        default=False
    )
    
    # Zarejestruj timer
    register_timer()

def unregister():
    # Wyłącz timer
    unregister_timer()
    
    # Usuń właściwość ze sceny
    if hasattr(bpy.types.Scene, 'blendic_active'):
        del bpy.types.Scene.blendic_active
    
    for cls in reversed(classes):
        bpy.utils.unregister_class(cls)

if __name__ == "__main__":
    register()