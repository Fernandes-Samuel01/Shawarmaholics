import React, { useEffect, useState } from 'react';

import { ArrowLeft, SlidersHorizontal, Plus, RefreshCw, Pencil, Trash2, ArrowUp, ArrowDown } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

const request = async (path, options = {}) => { const response = await fetch(`${API}${path}`, { headers: { 'Content-Type': 'application/json', ...options.headers }, ...options }); const data = await response.json().catch(() => ({})); if (!response.ok) { const error = new Error(data.message || 'Request failed'); error.status = response.status; throw error } return data };

const typeLabel = type => ({ SAUCE: 'Sauce', EXTRA: 'Extra', ADD_ON: 'Add-on' })[type] || type;

export default function MenuItemCustomizations({ item, onBack }) {

  const [assignedGroups, setAssignedGroups] = useState([]), [availableGroups, setAvailableGroups] = useState([]), [status, setStatus] = useState('loading'), [showForm, setShowForm] = useState(false), [groupId, setGroupId] = useState(''), [isRequired, setIsRequired] = useState(false), [minSelections, setMinSelections] = useState('0'), [maxSelections, setMaxSelections] = useState('1'), [formError, setFormError] = useState(''), [submitting, setSubmitting] = useState(false), [editingAssignment, setEditingAssignment] = useState(null), [editRequired, setEditRequired] = useState(false), [editMinSelections, setEditMinSelections] = useState('0'), [editMaxSelections, setEditMaxSelections] = useState('1'), [editError, setEditError] = useState(''), [editSubmitting, setEditSubmitting] = useState(false), [unassigningGroupId, setUnassigningGroupId] = useState(null), [reordering, setReordering] = useState(false);

  const load = async () => { setStatus('loading'); try { const [assignedData, availableData] = await Promise.all([request(`/admin/menu/items/${item.id}/customization-groups`), request(`/admin/menu/items/${item.id}/customization-groups/available`)]); setAssignedGroups(Array.isArray(assignedData.groups) ? assignedData.groups : []); setAvailableGroups(Array.isArray(availableData.groups) ? availableData.groups : []); setStatus('ready') } catch { setStatus('error') } };

  useEffect(() => { load() }, [item.id]);

  const openForm = selectedId => { setEditingAssignment(null); setEditError(''); setGroupId(selectedId == null ? (availableGroups[0] ? String(availableGroups[0].id) : '') : String(selectedId)); setIsRequired(false); setMinSelections('0'); setMaxSelections('1'); setFormError(''); setShowForm(true) };

  const closeForm = () => { if (submitting) return; setShowForm(false); setFormError('') };

  const openEdit = assignment => { setShowForm(false); setFormError(''); setEditingAssignment(assignment); setEditRequired(assignment.is_required === true); setEditMinSelections(String(assignment.min_selections)); setEditMaxSelections(String(assignment.max_selections)); setEditError('') };

  const closeEdit = () => { if (editSubmitting) return; setEditingAssignment(null); setEditError('') };

  const assignGroup = async event => { event.preventDefault(); const parsedGroupId = Number(groupId), parsedMin = Number(minSelections), parsedMax = Number(maxSelections); if (!Number.isInteger(parsedGroupId) || parsedGroupId < 1) { setFormError('Please select a customization group.'); return } if (!Number.isInteger(parsedMin) || parsedMin < 0) { setFormError('Minimum selections must be a non-negative integer.'); return } if (!Number.isInteger(parsedMax) || parsedMax < 0) { setFormError('Maximum selections must be a non-negative integer.'); return } if (parsedMax < parsedMin) { setFormError('Maximum selections must be greater than or equal to minimum selections.'); return } if (isRequired && parsedMin < 1) { setFormError('Required groups must have at least one minimum selection.'); return } setSubmitting(true); setFormError(''); try { await request(`/admin/menu/items/${item.id}/customization-groups`, { method: 'POST', body: JSON.stringify({ group_id: parsedGroupId, is_required: isRequired, min_selections: parsedMin, max_selections: parsedMax }) }); setShowForm(false); await load() } catch (error) { setFormError(error.status === 400 || error.status === 404 || error.status === 409 ? error.message : 'Unable to assign customization group. Please try again.') } finally { setSubmitting(false) } };

  const updateAssignment = async event => { event.preventDefault(); const parsedMin = Number(editMinSelections), parsedMax = Number(editMaxSelections); if (!Number.isInteger(parsedMin) || parsedMin < 0) { setEditError('Minimum selections must be a non-negative integer.'); return } if (!Number.isInteger(parsedMax) || parsedMax < 0) { setEditError('Maximum selections must be a non-negative integer.'); return } if (parsedMax < parsedMin) { setEditError('Maximum selections must be greater than or equal to minimum selections.'); return } if (editRequired && parsedMin < 1) { setEditError('Required groups must have at least one minimum selection.'); return } setEditSubmitting(true); setEditError(''); try { await request(`/admin/menu/items/${item.id}/customization-groups/${editingAssignment.group_id}`, { method: 'PATCH', body: JSON.stringify({ is_required: editRequired, min_selections: parsedMin, max_selections: parsedMax }) }); setEditingAssignment(null); await load() } catch (error) { setEditError(error.status === 400 || error.status === 404 ? error.message : 'Unable to update customization group assignment. Please try again.') } finally { setEditSubmitting(false) } };

  const reorderGroups = async (group, direction) => {
    if (reordering || unassigningGroupId !== null) return;

    const currentIndex = assignedGroups.findIndex(assignedGroup => assignedGroup.group_id === group.group_id);
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= assignedGroups.length) return;

    const nextGroups = [...assignedGroups];
    [nextGroups[currentIndex], nextGroups[targetIndex]] = [nextGroups[targetIndex], nextGroups[currentIndex]];

    setReordering(true);
    try {
      await request(`/admin/menu/items/${item.id}/customization-groups/reorder`, {
        method: 'PATCH',
        body: JSON.stringify({ group_ids: nextGroups.map(assignedGroup => assignedGroup.group_id) })
      });
      await load();
    } catch (error) {
      window.alert(error.status === 400 ? error.message : 'Unable to reorder customization groups. Please try again.');
    } finally {
      setReordering(false);
    }
  };

  const unassignGroup = async group => {
    if (unassigningGroupId !== null) return;
    if (!window.confirm(`Unassign ${group.group_name} from ${item.name}?`)) return;

    setUnassigningGroupId(group.group_id);
    try {
      await request(`/admin/menu/items/${item.id}/customization-groups/${group.group_id}`, { method: 'DELETE' });
      await load();
    } catch (error) {
      window.alert(error.status === 404 ? error.message : 'Unable to unassign customization group. Please try again.');
    } finally {
      setUnassigningGroupId(null);
    }
  };
  return <section className="admin-item-customizations" aria-labelledby="item-customizations-title">

    <button className="admin-back-button" type="button" onClick={onBack}><ArrowLeft /> Back to Master Menu</button>

    <header className="admin-item-customizations-header"><div className="admin-state-icon"><SlidersHorizontal /></div><div className="admin-item-customizations-title"><span className="admin-panel-eyebrow">MASTER MENU / ITEM CONFIGURATION</span><h1 id="item-customizations-title">Manage Customizations</h1><p><strong>{item.name}</strong> · Assign the centrally managed customization groups available for this item.</p></div><button className="admin-primary-action" type="button" onClick={() => openForm()} disabled={item.is_active === false || !availableGroups.length}><Plus /> Add Customization Group</button></header>

    {item.is_active === false && <div className="admin-ownership-note"><SlidersHorizontal /><p>This menu item is archived. Activate it before assigning customization groups.</p></div>}

    {showForm && <form className="admin-menu-create-form admin-assignment-form" onSubmit={assignGroup} noValidate><div><span className="admin-panel-eyebrow">NEW ITEM ASSIGNMENT</span><h2>Add Customization Group</h2><p>Configure how customers will select options from this group for <strong>{item.name}</strong>.</p></div><div className="admin-menu-form-grid"><label className="admin-menu-form-wide">Customization Group \*<select value={groupId} onChange={event => { setGroupId(event.target.value); if (formError) setFormError('') }} disabled={!availableGroups.length}><option value="">Select a group</option>{availableGroups.map(group => <option key={group.id} value={group.id}>{group.name} · {group.code} · {typeLabel(group.group_type)}</option>)}</select></label><label>Minimum Selections \*<input value={minSelections} onChange={event => { setMinSelections(event.target.value); if (formError) setFormError('') }} type="number" min="0" step="1" /></label><label>Maximum Selections \*<input value={maxSelections} onChange={event => { setMaxSelections(event.target.value); if (formError) setFormError('') }} type="number" min="0" step="1" /></label></div><div className="admin-menu-checkboxes"><label><input checked={isRequired} onChange={event => { setIsRequired(event.target.checked); if (formError) setFormError('') }} type="checkbox" /> Required</label></div>{isRequired && Number(minSelections) < 1 && <p className="admin-menu-form-warning">Required groups need at least one minimum selection.</p>}{formError && <p className="admin-form-error" role="alert">{formError}</p>}<div className="admin-category-form-actions"><button className="admin-secondary-action" type="button" onClick={closeForm} disabled={submitting}>Cancel</button><button className="admin-primary-action" type="submit" disabled={submitting || !availableGroups.length}>{submitting ? 'Assigning...' : 'Assign Group'}</button></div></form>}

    {editingAssignment && <form className="admin-menu-create-form admin-assignment-form" onSubmit={updateAssignment} noValidate><div><span className="admin-panel-eyebrow">EDIT ITEM ASSIGNMENT</span><h2>Edit {editingAssignment.group_name}</h2><p>Update selection rules for this assigned customization group. Its group and position stay unchanged.</p></div><div className="admin-menu-form-grid"><label>Minimum Selections \*<input value={editMinSelections} onChange={event => { setEditMinSelections(event.target.value); if (editError) setEditError('') }} type="number" min="0" step="1" /></label><label>Maximum Selections \*<input value={editMaxSelections} onChange={event => { setEditMaxSelections(event.target.value); if (editError) setEditError('') }} type="number" min="0" step="1" /></label></div><div className="admin-menu-checkboxes"><label><input checked={editRequired} onChange={event => { setEditRequired(event.target.checked); if (editError) setEditError('') }} type="checkbox" /> Required</label></div>{editRequired && Number(editMinSelections) < 1 && <p className="admin-menu-form-warning">Required groups need at least one minimum selection.</p>}{editError && <p className="admin-form-error" role="alert">{editError}</p>}<div className="admin-category-form-actions"><button className="admin-secondary-action" type="button" onClick={closeEdit} disabled={editSubmitting}>Cancel</button><button className="admin-primary-action" type="submit" disabled={editSubmitting}>{editSubmitting ? 'Saving...' : 'Save Changes'}</button></div></form>}

    {status === 'loading' && <div className="admin-branch-feedback" role="status">Loading item customizations...</div>}

    {status === 'error' && <div className="admin-branch-feedback admin-branch-feedback-error" role="alert"><p>Unable to load item customizations.</p><button className="admin-retry-button" type="button" onClick={load}><RefreshCw /> Retry</button></div>}

    {status === 'ready' && <><div className="admin-section-heading admin-item-customization-heading"><span className="admin-panel-eyebrow">ITEM CONFIGURATION</span><h2>Assigned Customizations</h2><p>Groups currently available to this master menu item.</p></div>{!assignedGroups.length ? <div className="admin-branch-feedback" role="status"><strong>No customization groups assigned</strong><p>Assign a centrally managed group to configure this item.</p></div> : <AssignmentTable groups={assignedGroups} onEdit={openEdit} onUnassign={unassignGroup} onReorder={reorderGroups} unassigningGroupId={unassigningGroupId} reordering={reordering} />}<div className="admin-section-heading admin-item-customization-heading"><span className="admin-panel-eyebrow">AVAILABLE GROUPS</span><h2>Available Customization Groups</h2><p>Active global groups not yet assigned to this item.</p></div>{!availableGroups.length ? <div className="admin-branch-feedback" role="status"><strong>No customization groups available</strong><p>All active groups are already assigned to this menu item.</p></div> : <div className="admin-customization-table-wrap"><table className="admin-customization-table"><caption className="sr-only">Available customization groups for {item.name}</caption><thead><tr><th scope="col">Group</th><th scope="col">Code</th><th scope="col">Type</th><th scope="col">Global Position</th><th scope="col">Actions</th></tr></thead><tbody>{availableGroups.map(group => <tr key={group.id}><td data-label="Group"><strong>{group.name}</strong></td><td data-label="Code"><span className="admin-customization-code">{group.code}</span></td><td data-label="Type"><span className="admin-customization-type">{typeLabel(group.group_type)}</span></td><td data-label="Global Position"><span className="admin-category-order">#{group.position}</span></td><td data-label="Actions"><button className="admin-category-edit-action" type="button" onClick={() => openForm(group.id)} disabled={item.is_active === false}>Assign</button></td></tr>)}</tbody></table></div>}</>}

  </section>;

}

function AssignmentTable({ groups, onEdit, onUnassign, onReorder, unassigningGroupId, reordering }) { return <div className="admin-customization-table-wrap"><table className="admin-customization-table"><caption className="sr-only">Assigned customization groups</caption><thead><tr><th scope="col">Group</th><th scope="col">Code</th><th scope="col">Type</th><th scope="col">Required</th><th scope="col">Minimum</th><th scope="col">Maximum</th><th scope="col">Position</th><th scope="col">Status</th><th scope="col">Actions</th></tr></thead><tbody>{groups.map((group, index) => <tr key={group.group_id}><td data-label="Group"><strong>{group.group_name}</strong></td><td data-label="Code"><span className="admin-customization-code">{group.group_code}</span></td><td data-label="Type"><span className="admin-customization-type">{typeLabel(group.group_type)}</span></td><td data-label="Required">{group.is_required ? 'Required' : 'Optional'}</td><td data-label="Minimum">{group.min_selections}</td><td data-label="Maximum">{group.max_selections}</td><td data-label="Position"><span className="admin-category-order">#{group.position}</span></td><td data-label="Status"><span className={`admin-category-status ${group.group_is_active ? 'active' : 'archived'}`}><i />{group.group_is_active ? 'Active' : 'Archived'}</span></td><td data-label="Actions"><div className="admin-category-actions"><button className="admin-category-edit-action" type="button" onClick={() => onReorder(group, 'up')} aria-label={`Move ${group.group_name} up`} disabled={reordering || unassigningGroupId !== null || index === 0}><ArrowUp /> Up</button><button className="admin-category-edit-action" type="button" onClick={() => onReorder(group, 'down')} aria-label={`Move ${group.group_name} down`} disabled={reordering || unassigningGroupId !== null || index === groups.length - 1}><ArrowDown /> Down</button><button className="admin-category-edit-action" type="button" onClick={() => onEdit(group)} aria-label={`Edit ${group.group_name} assignment`} disabled={reordering || unassigningGroupId !== null}><Pencil /> Edit</button><button className="admin-category-edit-action" type="button" onClick={() => onUnassign(group)} aria-label={`Unassign ${group.group_name}`} disabled={reordering || unassigningGroupId !== null}>{unassigningGroupId === group.group_id ? 'Unassigning...' : <><Trash2 /> Unassign</>}</button></div></td></tr>)}</tbody></table></div> }