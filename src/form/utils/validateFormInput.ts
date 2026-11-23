import { FormInputInterface } from "@/form/FormInputInterface"
import ViolationInterface, { createViolation, isZodError } from "@/form/Violation"
import { translate } from "react-mini-i18n"

// false and 0 are answers, not missing values
export function isEmptyValue(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    value === "" ||
    (Array.isArray(value) && value.length === 0)
  )
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return typeof (value as PromiseLike<unknown> | undefined)?.then === "function"
}

/**
 * The violations an error thrown by a `validator` stands for.
 */
function violationsFromError(error: unknown, name: string): ViolationInterface[] {
  if (!(error instanceof Error)) {
    return [createViolation({ message: "Unknown error" })]
  }

  if (isZodError(error)) {
    return (error.issues ?? []).map((issue) =>
      createViolation({
        propertyPath: name,
        code: issue.code,
        message: issue.message,
      })
    )
  }

  // An error may name the property it is about (a range blames its end date,
  // for instance).
  const { propertyPath } = error as Error & ViolationInterface
  return [
    createViolation({
      ...(propertyPath ? { propertyPath } : {}),
      message: error.message,
    }),
  ]
}

export interface FormInputValidation {
  /** What the checks that answer at once found: `required`, `min`, `max`, `validator`. */
  violations: ViolationInterface[]
  /**
   * Set when `validator` returned a promise: resolves, never rejects, with the
   * violations that promise stands for.
   */
  pending?: Promise<ViolationInterface[]>
}

/**
 * Checks one input against `data`, the whole form data. An asynchronous
 * validator is not waited for here: see {@link FormInputValidation.pending}.
 */
export function validateFormInput(
  formInput: FormInputInterface,
  name: string,
  data: any
): FormInputValidation {
  const violations: ViolationInterface[] = []
  const { value } = formInput

  if (formInput.required && isEmptyValue(value)) {
    violations.push(
      createViolation({
        propertyPath: name,
        code: "required",
        message: translate("This field is required"),
      })
    )
    return { violations }
  }

  if (typeof value === "number") {
    const { min, max } = formInput
    if (typeof min === "number" && value < min) {
      violations.push(
        createViolation({
          propertyPath: name,
          code: "min",
          message: translate(
            "This value should be greater than or equal to {{min}}",
            {
              min,
            }
          ),
        })
      )
    }
    if (typeof max === "number" && value > max) {
      violations.push(
        createViolation({
          propertyPath: name,
          code: "max",
          message: translate("This value should be less than or equal to {{max}}", {
            max,
          }),
        })
      )
    }
  }

  if (!formInput.validator) return { violations }

  try {
    const result: unknown = formInput.validator(value, data)

    if (isThenable(result)) {
      return {
        violations,
        pending: Promise.resolve(result).then(
          () => [],
          (error: unknown) => violationsFromError(error, name)
        ),
      }
    }
  } catch (error) {
    violations.push(...violationsFromError(error, name))
  }

  return { violations }
}
