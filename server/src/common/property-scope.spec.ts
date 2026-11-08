import { describe, expect, it } from 'vitest';
import { PropertyScope } from './property-scope';

describe('PropertyScope', () => {
  const scope = new PropertyScope('prop-1');

  it('filters by property when there is no other condition', () => {
    expect(scope.where()).toEqual({ propertyId: 'prop-1' });
    expect(scope.where({})).toEqual({ propertyId: 'prop-1' });
  });

  it('ANDs the property filter with the caller condition, so the caller cannot widen it', () => {
    expect(scope.where({ status: 'REPORTED' })).toEqual({
      AND: [{ status: 'REPORTED' }, { propertyId: 'prop-1' }],
    });
    // A client-supplied propertyId cannot escape the scope: both conditions must hold.
    expect(scope.where({ propertyId: 'prop-2' })).toEqual({
      AND: [{ propertyId: 'prop-2' }, { propertyId: 'prop-1' }],
    });
  });

  it('follows a relation path for models without propertyId', () => {
    expect(scope.where({ id: 'p' }, 'ticket')).toEqual({
      AND: [{ id: 'p' }, { ticket: { propertyId: 'prop-1' } }],
    });
    expect(scope.where({}, 'room.block')).toEqual({ room: { block: { propertyId: 'prop-1' } } });
  });

  it('forces propertyId on creates, overriding anything client-supplied', () => {
    expect(scope.data({ name: 'x', propertyId: 'prop-2' })).toEqual({
      name: 'x',
      propertyId: 'prop-1',
    });
  });
});
