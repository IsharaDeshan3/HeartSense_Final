def update_item_status(state, category, key, status):
    if key in state.__dict__[category]:
        state.__dict__[category][key].status = status
    return state
