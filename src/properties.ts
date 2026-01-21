import { PropertySequenceUpdate } from "albatros/enums";

declare interface EnumManifestPropertyProvider extends ManifestPropertyProvider {
    values: Record<string, string>;
}

export default {
    'property:float': (ctx: Context & ManifestPropertyProvider): ObjectPropertyProvider => {
        return {
            getProperties(objects: unknown[]) {
                const field = ctx.field;
                if (field === undefined) {
                    return [];
                }
                return [{
                    id: `float-${field}`,
                    label: ctx.label ?? field,
                    description: ctx.description,
                    group: ctx.group,
                    value() {
                        const value = (objects[0] as any)[field];
                        for (let i = 1; i < objects.length; ++i) {
                            if (value !== (objects[i] as any)[field]) {
                                return {
                                    label: ctx.tr('**Различные**'),
                                };
                            }
                        }
                        return {
                            label: value,
                            suffix: ctx.units as string,
                        };
                    },
                    editor() {
                        return {
                            type: 'editbox',
                            commit(value?: string) {
                                if (value === undefined) {
                                    return;
                                }
                                const number = parseFloat(value);
                                for (const object of objects) {
                                    try {
                                        (object as any)[field] = number;
                                    } catch (e) {
                                        console.error(e);
                                    }
                                }
                            },
                            validate(value?: string) {
                                if (value === undefined) {
                                    return;
                                }
                                if (value === '') {
                                    return ctx.tr('Поле не может быть пустым');
                                }
                                const number = parseFloat(value);
                                if (!isFinite(number)) {
                                    return ctx.tr('Значение должно быть числом');
                                }
                            },
                        }
                    },
                }];
            },
        };
    },
    'property:enum': (ctx: Context & EnumManifestPropertyProvider): ObjectPropertyProvider => {
        return {
            getProperties(objects: unknown[]) {
                const field = ctx.field;
                if (field === undefined) {
                    return [];
                }
                return [{
                    id: `enum-${field}`,
                    label: ctx.label ?? field,
                    description: ctx.description,
                    group: ctx.group,
                    value() {
                        const value = (objects[0] as any)[field];
                        for (let i = 1; i < objects.length; ++i) {
                            if (value !== (objects[i] as any)[field]) {
                                return {
                                    label: ctx.tr('**Различные**'),
                                };
                            }
                        }
                        return {
                            label: ctx.values[value],
                        };
                    },
                    editor() {
                        return {
                            type: 'dropdown',
                            provider(treeview: TreeView<TreeItem>, commit: (reload?: PropertySequenceUpdate) => void): PropertyEditorDropdownTreeViewOptions<TreeItem> {
                                treeview.onDidChangeActive((e) => {
                                    if (e.element === undefined) {
                                        return;
                                    }
                                    for (let i = 0; i < objects.length; ++i) {
                                        (objects[i] as any)[field] = e.element.id;
                                    }
                                    commit(PropertySequenceUpdate.Property);
                                });
                                return {
                                    treeDataProvider: {
                                        getChildren(_element: TreeItem | undefined, _treeview: TreeView<TreeItem>): ProviderResult<TreeItem[]> {
                                            return Object.entries(ctx.values).map(([key, val]) => {
                                                return {
                                                    id: key,
                                                    label: val,
                                                };
                                            });
                                        },
                                        hasChildren(_element: TreeItem, _treeview: TreeView<TreeItem>): boolean {
                                            return false;
                                        },
                                    }
                                };
                            }
                        }
                    },
                }];
            },
        };
    },
}
