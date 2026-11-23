import { FormBuiltInterface, FormInterfaceValueType } from "@/form/FormInterface"
import getFormInputsFromForm from "@/form/utils/getFormInputsFromForm"
import { validateFormInput } from "@/form/utils/validateFormInput"
import { FormInputInterface } from "@/form/FormInputInterface"
import { isFormInputHidden } from "@/form/utils/isFormInputHidden"

export function validateForm<
  Data extends FormInterfaceValueType = FormInterfaceValueType,
>(form: FormBuiltInterface<Data>): FormBuiltInterface<Data> {
  if (!form.inputs) return { ...form }

  // Every validated input is copied: the inputs of the given form are left as
  // they are.
  const inputs: Record<string, FormInputInterface> = { ...form.inputs }
  const newForm = { ...form, inputs }

  getFormInputsFromForm(newForm)
    // Nothing to fix on a hidden input: it is not validated at all
    .filter((e) => e.generatedValue !== true && !isFormInputHidden(e, form))
    .forEach((formInput) => {
      if (!formInput?.name) {
        return
      }

      const current = newForm.inputs[formInput.name]
      const { violations } = validateFormInput(current, formInput.name, newForm.data)
      inputs[formInput.name] = { ...current, violations }
    })

  return newForm as FormBuiltInterface<Data>
}
